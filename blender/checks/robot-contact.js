// Distance in metres from a hand point to the robot's head box: the stage's robot.slap measure, shared by
// stage.mjs and the pose matrix's slap run.
import * as THREE from 'three';

export function robotContact(robotRoot, handAt) {
  const head = robotRoot.getObjectByName('robot_head') ?? robotRoot;
  return new THREE.Box3().setFromObject(head).distanceToPoint(new THREE.Vector3(...handAt));
}
