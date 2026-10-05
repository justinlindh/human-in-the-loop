#!/usr/bin/env python
"""GPU worker for scripts/tools/mocap/track.mjs: one shot clip in, one shot JSON out.

Runs, in this order: Depth Anything 3 camera path, YOLOX + ByteTrack identities, GEM-X (SOMA joint
rotations, camera-space and world motion) per person with the DA3 camera as its camera trajectory, and an
RTMPose-x 2D gate that marks which joints the image supports. Runs inside the environment that
scripts/tools/mocap/setup.sh builds (HITL_MOCAP_HOME).
"""
import argparse
import functools
import json
import os
import shutil
import sys
import time
from pathlib import Path
from types import SimpleNamespace

HOME = Path(os.environ.get("HITL_MOCAP_HOME", Path.home() / ".cache" / "hitl-mocap"))
GEM = HOME / "gem-x"
sys.path.insert(0, str(GEM))

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import torch  # noqa: E402
from scipy.spatial.transform import Rotation  # noqa: E402

# COCO-17 index -> SOMA joint names the 2D gate speaks for; every other joint inherits from its nearest
# gated ancestor (fingers from the hand, spine from the hips and shoulders).
GATE = {
    "LeftArm": [5], "RightArm": [6], "LeftForeArm": [7], "RightForeArm": [8], "LeftHand": [9], "RightHand": [10],
    "LeftLeg": [11], "RightLeg": [12], "LeftShin": [13], "RightShin": [14], "LeftFoot": [15], "RightFoot": [16],
    "Head": [0, 1, 2, 3, 4],
}
GATE_THRESHOLD = 0.4


def log(msg):
    print(f"track_worker: {msg}", file=sys.stderr, flush=True)


def read_frames(path):
    cap = cv2.VideoCapture(str(path))
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f)
    cap.release()
    return frames


def camera_path(frames, weights, width, height):
    """DA3 world-to-camera (T, 4, 4), full-resolution intrinsics (T, 3, 3) and depth maps (T, h, w)."""
    from depth_anything_3.api import DepthAnything3
    from PIL import Image

    model = DepthAnything3.from_pretrained(weights).to("cuda").eval()
    pred = model.inference([Image.fromarray(f[..., ::-1]) for f in frames], process_res=504)
    ext = np.asarray(pred.extrinsics, dtype=np.float64)
    if ext.shape[1] == 3:
        ext = np.concatenate([ext, np.tile(np.array([[[0, 0, 0, 1.0]]]), (len(ext), 1, 1))], axis=1)
    K = np.asarray(pred.intrinsics, dtype=np.float64).copy()
    ph, pw = pred.depth.shape[1:3]
    K[:, 0, :] *= width / pw
    K[:, 1, :] *= height / ph
    depth = np.asarray(pred.depth, dtype=np.float32)
    del model
    torch.cuda.empty_cache()
    return ext, K, depth


def track_people(frames, min_frames):
    """ByteTrack ids over the shot: {id: {frame: xyxy}} for ids seen in at least min_frames frames."""
    from gem.utils.yolox_detector import ByteTracker, YOLOXDetector

    det, tracker = YOLOXDetector(device="cuda"), ByteTracker()
    seen = {}
    for t, f in enumerate(frames):
        boxes, scores = det.detect(f.copy())
        for box, tid, _ in tracker.update(boxes, scores):
            seen.setdefault(int(tid), {})[t] = np.array(box, dtype=np.float32)
    return {k: v for k, v in seen.items() if len(v) >= min_frames}


def filled_boxes(obs, n, width, height):
    idx = np.array(sorted(obs))
    out = np.zeros((n, 4), np.float32)
    for t in range(n):
        out[t] = obs[int(idx[np.abs(idx - t).argmin()])]
    out[:, [0, 2]] = out[:, [0, 2]].clip(0, width - 1)
    out[:, [1, 3]] = out[:, [1, 3]].clip(0, height - 1)
    return out


def gate_scores(frames, boxes_by_id):
    """RTMPose-x 2D scores per person and frame, (T, 17), matched to the person's box by centre."""
    import onnxruntime as ort
    from rtmlib import Body

    ort.preload_dlls()
    body = Body(mode="performance", backend="onnxruntime", device="cuda")
    out = {pid: np.zeros((len(frames), 17)) for pid in boxes_by_id}
    for t, f in enumerate(frames):
        kps, sc = body(f)
        if len(kps) == 0:
            continue
        cents = np.array([k[5:13].mean(0) for k in kps])
        for pid, b in boxes_by_id.items():
            c = np.array([(b[t, 0] + b[t, 2]) / 2, (b[t, 1] + b[t, 3]) / 2])
            j = int(np.linalg.norm(cents - c, axis=1).argmin())
            if np.linalg.norm(cents[j] - c) < 0.6 * max(b[t, 2] - b[t, 0], b[t, 3] - b[t, 1]):
                out[pid][t] = sc[j]
    return out


def trust_matrix(scores, names, parents):
    """(T, J) bool: a gated joint is trusted when its 2D score reaches the threshold; the rest inherit."""
    n = len(scores)
    trust = np.zeros((n, len(names)), bool)
    gated = {names.index(k): v for k, v in GATE.items()}
    for j in range(len(names)):
        a = j
        while a >= 0 and a not in gated:
            a = parents[a]
        if a >= 0:
            trust[:, j] = scores[:, gated[a]].mean(axis=1) >= GATE_THRESHOLD
        else:
            # Above every gated joint (hips, spine): trusted when the hips and shoulders are.
            trust[:, j] = scores[:, [5, 6, 11, 12]].mean(axis=1) >= GATE_THRESHOLD
    return trust


def quats(aa):
    flat = Rotation.from_rotvec(aa.reshape(-1, 3)).as_quat()
    return flat.reshape(*aa.shape[:-1], 4)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--frame-offset", type=int, default=0)
    ap.add_argument("--fps", type=float, required=True)
    ap.add_argument("--width", type=int, required=True)
    ap.add_argument("--height", type=int, required=True)
    ap.add_argument("--models", required=True)
    ap.add_argument("--no-camera", action="store_true")
    ap.add_argument("--min-frames", type=int, default=12)
    a = ap.parse_args()
    models = json.loads(Path(a.models).read_text())
    clip = Path(a.clip).resolve()
    out = Path(a.out).resolve()
    work = out.parent / (out.stem + "-work")
    t0 = time.time()
    os.chdir(GEM)

    frames = read_frames(clip)
    n = len(frames)
    log(f"{n} frames")
    from gem.utils.geo_transform import get_bbx_xys_from_xyxy

    if a.no_camera:
        ext = np.tile(np.eye(4), (n, 1, 1))
        K = depth = None
    else:
        ext, K, depth = camera_path(frames, models["depthAnything3"]["weights"], a.width, a.height)
        log("camera path done")
    tracks = track_people(frames, a.min_frames)
    log(f"{len(tracks)} person track(s): {[(k, len(v)) for k, v in tracks.items()]}")

    import importlib.util

    spec = importlib.util.spec_from_file_location("gem_demo_soma", GEM / "scripts" / "demo" / "demo_soma.py")
    demo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(demo)
    torch.load = functools.partial(torch.load, weights_only=False)
    import hydra
    from gem.utils import matrix
    from gem.utils.net_utils import detach_to_cpu
    from gem.utils.rotation_conversions import axis_angle_to_matrix
    from gem.utils.soma_utils.soma_layer import SomaLayer

    torch.set_grad_enabled(False)
    soma = SomaLayer(data_root="inputs/soma_assets", low_lod=True, device="cuda", identity_model_type="mhr", mode="warp")
    names = [str(x) for x in np.load("inputs/soma_assets/SOMA_neutral.npz", allow_pickle=False)["joint_names"]][1:]
    parents = [int(p) for p in soma.parents]
    model = None
    people, boxes = [], {}
    for pid, obs in tracks.items():
        boxes[pid] = filled_boxes(obs, n, a.width, a.height)
    scores = gate_scores(frames, boxes)
    for pid in tracks:
        pdir = work / f"p{pid}"
        (pdir / "preprocess").mkdir(parents=True, exist_ok=True)
        b = torch.from_numpy(boxes[pid]).float()
        torch.save({"bbx_xyxy": b, "bbx_xys": get_bbx_xys_from_xyxy(b, base_enlarge=1.2).float()}, pdir / "preprocess" / "bbx.pt")
        if not a.no_camera:
            torch.save(torch.from_numpy(ext).float(), pdir / "preprocess" / "camera.pt")
        args = SimpleNamespace(video=str(clip), output_root=str(work), static_cam=a.no_camera, verbose=False, render_mhr=False,
                               sam3d_ckpt_path=None, sam3d_mhr_path=None, ckpt=None, exp="gem_soma_regression", retarget=False)
        cfg = demo._build_cfg(args)
        # Each person gets its own output directory under the work dir.
        cfg.video_name, cfg.output_dir = f"p{pid}", str(pdir)
        cfg.preprocess_dir = str(pdir / "preprocess")
        for k, v in {"bbx": "bbx.pt", "vitpose": "vitpose.pt", "vit_features": "vit_features.pt", "slam": "camera.pt"}.items():
            cfg.paths[k] = str(pdir / "preprocess" / v)
        cfg.paths["hpe_results"] = str(pdir / "hpe_results.pt")
        demo.run_preprocess(cfg)
        data = demo.load_data_dict(cfg)
        if model is None:
            model = hydra.utils.instantiate(cfg.model, _recursive_=False)
            model.load_pretrained_model(demo.resolve_ckpt_path(cfg))
            model = model.eval().cuda()
        with torch.no_grad():
            pred = detach_to_cpu(model.predict(data, static_cam=a.no_camera, postproc=True))
        res = {}
        for space in ("incam", "global"):
            p = {k: v.cuda()[None] for k, v in pred[f"body_params_{space}"].items() if k in ("body_pose", "global_orient", "transl", "identity_coeffs", "scale_params")}
            aa = torch.cat([p["global_orient"], p["body_pose"]], dim=-1).reshape(1, -1, 77, 3)
            sk = soma.get_skeleton(p["identity_coeffs"].float(), p["scale_params"].float())
            par = torch.tensor(parents, device="cuda")
            loc = sk - sk[:, :, par]
            loc = torch.cat([sk[:, :, :1], loc[:, :, 1:]], dim=2)
            loc[..., 0, :] += p["transl"]
            fk = matrix.forward_kinematics(matrix.get_TRS(axis_angle_to_matrix(aa), loc), parents)
            res[space] = (matrix.get_position(fk)[0].cpu().numpy(), aa[0].cpu().numpy())
        pos_cam, aa_cam = res["incam"]
        pos_world, aa_world = res["global"]
        rot = quats(aa_world)
        rot[:, 1:] = quats(aa_cam)[:, 1:]  # local joint rotations are the same in both spaces
        people.append({
            "id": int(pid),
            "observed": [int(t in tracks[pid]) for t in range(n)],
            "rot_local": np.round(rot, 5).tolist(),
            "root_orient_cam": np.round(quats(aa_cam[:, 0]), 5).tolist(),
            "root_pos_cam": np.round(pos_cam[:, 0], 5).tolist(),
            "joint_pos_world": np.round(pos_world, 5).tolist(),
            "trust": trust_matrix(scores[pid], names, parents).astype(int).tolist(),
        })
        log(f"person {pid} done")
    # DA3's units are relative. Scale them to metres by matching GEM's person depth to DA3's depth at the
    # person's root pixel, then place each root in the shared scene through the camera path.
    scale = 1.0
    if depth is not None:
        ph, pw = depth.shape[1:3]
        ratios = []
        for p in people:
            rc = np.array(p["root_pos_cam"])
            u = (K[:, 0, 0] * rc[:, 0] / rc[:, 2] + K[:, 0, 2]) * pw / a.width
            v = (K[:, 1, 1] * rc[:, 1] / rc[:, 2] + K[:, 1, 2]) * ph / a.height
            ok = (u >= 0) & (u < pw) & (v >= 0) & (v < ph) & (np.array(p["observed"]) > 0)
            for t in np.where(ok)[0]:
                d = depth[t, int(v[t]), int(u[t])]
                if d > 1e-3:
                    ratios.append(rc[t, 2] / d)
        if ratios:
            scale = float(np.median(ratios))
    c2w = np.linalg.inv(ext)
    for p in people:
        rc = np.array(p["root_pos_cam"])
        p["root_pos_scene"] = np.round(np.einsum("tij,tj->ti", c2w[:, :3, :3], rc) + scale * c2w[:, :3, 3], 5).tolist()
    cam = {"source": "static" if a.no_camera else "depth-anything-3-base", "w2c": np.round(ext[:, :3, :], 6).tolist(), "scale_to_metres": scale}
    if K is not None:
        cam["intrinsics"] = np.round(K, 3).tolist()
    result = {
        "format": "hitl-mocap-shot", "version": 1,
        "shot": {"start_frame": a.frame_offset, "frames": n, "fps": a.fps, "width": a.width, "height": a.height},
        "models": {k: models[k] for k in ("gemX", "soma", "sam3dBody", "depthAnything3", "gemCheckpoint", "gate2d")},
        "units": {"position": "metres", "rotation": "quaternion [x, y, z, w], local to parent; joint 0 is the world root orientation",
                  "cameraSpace": "x right, y down, z forward", "world": "y up"},
        "joints": names, "parents": parents, "gate": {"threshold": GATE_THRESHOLD},
        "camera": cam, "people": people,
    }
    out.write_text(json.dumps(result))
    shutil.rmtree(work, ignore_errors=True)
    log(f"done in {time.time() - t0:.1f} s")


if __name__ == "__main__":
    main()
