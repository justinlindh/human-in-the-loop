#!/usr/bin/env bash
# Builds the motion tracking environment outside the repo: a uv venv, the pinned GEM-X checkout (with its
# SOMA and SAM-3D-Body submodules), Depth Anything 3, rtmlib and onnxruntime-gpu, and the model weights.
# Everything lands in HITL_MOCAP_HOME (default ~/.cache/hitl-mocap); nothing is written to the repo.
# Re-running skips finished steps; --force wipes the directory first.
# Usage: scripts/tools/mocap/setup.sh [--force] [--no-weights]
#   HITL_MOCAP_HOME   where the environment goes
#   HITL_MOCAP_TORCH  the PyTorch wheel index suffix (default from models.json, e.g. cu130); it has to match
#                     the CUDA toolkit nvcc reports, because detectron2 builds against it
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="${HITL_MOCAP_HOME:-$HOME/.cache/hitl-mocap}"
force=0; weights=1
for a in "$@"; do
  case "$a" in
    --force) force=1 ;;
    --no-weights) weights=0 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "setup: unknown option $a" >&2; exit 2 ;;
  esac
done
for c in uv git git-lfs nvcc; do command -v "$c" >/dev/null || { echo "setup: $c is required" >&2; exit 3; }; done
field() { python3 -c "import json,sys; d=json.load(open('$HERE/models.json')); print(eval('d'+sys.argv[1]))" "$1"; }
TORCH_INDEX="${HITL_MOCAP_TORCH:-$(field "['torchIndex']")}"
[ "$force" = 1 ] && rm -rf "$HOME_DIR"
mkdir -p "$HOME_DIR"
cd "$HOME_DIR"
done_marker() { [ -f ".done-$1" ]; }
mark() { touch ".done-$1"; }

if ! done_marker venv; then
  uv venv -q -p 3.12 venv
  mark venv
fi
# shellcheck disable=SC1091
. venv/bin/activate
pin_torch() { uv pip install -q --reinstall torch torchvision --index-url "https://download.pytorch.org/whl/$TORCH_INDEX"; }

if ! done_marker gem; then
  [ -d gem-x ] || git clone -q "$(field "['gemX']['repo']")" gem-x
  git -C gem-x checkout -q "$(field "['gemX']['commit']")"
  git -C gem-x submodule update -q --init third_party/soma third_party/sam-3d-body
  for s in soma:soma sam3dBody:sam-3d-body; do
    want="$(field "['${s%%:*}']['commit']")"; have="$(git -C "gem-x/third_party/${s##*:}" rev-parse HEAD)"
    [ "$want" = "$have" ] || { echo "setup: ${s##*:} is at $have, models.json pins $want" >&2; exit 4; }
  done
  pin_torch
  uv pip install -q -e gem-x/third_party/soma
  (cd gem-x/third_party/soma && git lfs pull)
  if git -C gem-x/third_party/soma apply --check "$HERE/patches/soma-sparse-validate.patch" 2>/dev/null; then
    git -C gem-x/third_party/soma apply "$HERE/patches/soma-sparse-validate.patch"
  fi
  (cd gem-x && bash scripts/install_env.sh)
  mkdir -p gem-x/inputs
  ln -sfn "$HOME_DIR/gem-x/third_party/soma/assets" gem-x/inputs/soma_assets
  mark gem
fi

if ! done_marker libs; then
  uv pip install -q rtmlib opencv-python-headless scipy matplotlib omegaconf einops addict huggingface_hub safetensors "moviepy<2" pillow imageio trimesh plyfile pycolmap evo
  # The CPU and GPU onnxruntime wheels share one package directory: both installed means no CUDA provider.
  uv pip uninstall -q onnxruntime onnxruntime-gpu 2>/dev/null || true
  uv pip install -q "onnxruntime-gpu[cuda,cudnn]"
  uv pip install -q --no-deps "git+$(field "['depthAnything3']['repo']")@$(field "['depthAnything3']['commit']")"
  # GEM's install pulls a CPU torch; the CUDA pair goes in last so every package sees one build.
  pin_torch
  mark libs
fi

python - <<'EOF'
import torch, onnxruntime as ort
ort.preload_dlls()
assert torch.cuda.is_available(), "torch cannot see the GPU"
assert "CUDAExecutionProvider" in ort.get_available_providers(), "onnxruntime has no CUDA provider"
print("setup: torch", torch.__version__, "and onnxruntime CUDA ok")
EOF

if [ "$weights" = 1 ] && ! done_marker weights; then
  python - "$HERE/models.json" <<'EOF'
import json, sys
from huggingface_hub import hf_hub_download, snapshot_download
m = json.load(open(sys.argv[1]))
snapshot_download(m["depthAnything3"]["weights"])
import os; os.chdir(os.path.expanduser(os.environ.get("HITL_MOCAP_HOME", "~/.cache/hitl-mocap")) + "/gem-x")
sys.path.insert(0, ".")
from gem.utils import hf_utils
for f in (hf_utils.download_checkpoint, hf_utils.download_vitpose_checkpoint, hf_utils.download_sam3d_checkpoint, hf_utils.download_mhr_model, hf_utils.download_soma_data):
    f()
print("setup: weights downloaded")
EOF
  mark weights
fi
echo "setup: ok ($HOME_DIR)"
