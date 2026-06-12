import {
  decorateNode,
  getNodeIds,
  nodeExists,
  POSITIONS,
  readNode,
  STACKS,
  validateNodeShape
} from "./hrcData.js";

const sampleArg = process.argv.find((arg) => arg.startsWith("--sample="));
const sampleSize = sampleArg ? Number(sampleArg.split("=")[1]) : null;

for (const stack of STACKS) {
  const ids = getNodeIds(stack);
  if (!ids.length || !ids.includes(0)) {
    throw new Error(`${stack}: expected at least one node and root node 0`);
  }

  const idsToCheck = sampleSize ? ids.slice(0, sampleSize) : ids;
  const missingRefs = [];
  for (const id of idsToCheck) {
    const node = readNode(stack, id);
    validateNodeShape(stack, id, node);
    for (const action of node.actions) {
      if (action.node !== undefined && !nodeExists(stack, action.node)) {
        missingRefs.push(`${id}->${action.node}`);
      }
    }
  }

  const root = decorateNode(stack, 0);
  if (root.position !== POSITIONS[0]) {
    throw new Error(`${stack}: root must start UTG`);
  }
  const warning = missingRefs.length ? `, missing refs ${missingRefs.slice(0, 5).join(", ")}` : "";
  console.log(`${stack}: ok (${idsToCheck.length}/${ids.length} nodes checked, max id ${ids.at(-1)}${warning})`);
}
