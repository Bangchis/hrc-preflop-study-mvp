import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = path.resolve(process.env.HRC_DATA_ROOT ?? DEFAULT_DATA_ROOT);

export const POSITIONS = ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
export const STACKS = discoverStacks();
export const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

const settingsCache = new Map();
const nodeCache = new Map();

export class DataError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function assertStack(stack) {
  if (!STACKS.includes(stack)) {
    throw new DataError(404, `Unknown stack: ${stack}`);
  }
}

export function readSettings(stack) {
  assertStack(stack);
  if (!settingsCache.has(stack)) {
    const filePath = path.join(DATA_ROOT, stack, "settings.json");
    const settings = JSON.parse(fs.readFileSync(filePath, "utf8"));
    validateSettings(stack, settings);
    settingsCache.set(stack, settings);
  }
  return settingsCache.get(stack);
}

export function readNode(stack, nodeId) {
  assertStack(stack);
  const id = Number(nodeId);
  if (!Number.isInteger(id) || id < 0) {
    throw new DataError(400, `Invalid node id: ${nodeId}`);
  }
  const cacheKey = `${stack}:${id}`;
  if (!nodeCache.has(cacheKey)) {
    const filePath = path.join(DATA_ROOT, stack, "nodes", `${id}.json`);
    if (!fs.existsSync(filePath)) {
      throw new DataError(404, `Node not found: ${stack}/${id}`);
    }
    const node = JSON.parse(fs.readFileSync(filePath, "utf8"));
    validateNodeShape(stack, id, node);
    nodeCache.set(cacheKey, node);
  }
  return nodeCache.get(cacheKey);
}

export function getStackInfo(stack) {
  const settings = readSettings(stack);
  const bb = getBb(settings);
  const stackChips = settings.handdata.stacks[0];
  return {
    id: stack,
    label: stack,
    stackBb: stackChips / bb,
    stackChips,
    bb,
    sb: getSb(settings),
    bbAnte: getBbAnte(settings),
    positions: POSITIONS,
    game: "8-max MTT",
    equityModel: settings.eqmodel.id,
    anteType: settings.handdata.anteType,
    straddleType: settings.handdata.straddleType,
    preflopSizes: settings.treeconfig.preflop.settings.PREFLOP_SIZES,
    postflopMode: settings.treeconfig.postflop?.id ?? "unknown"
  };
}

export function listStacks() {
  return STACKS.map((stack) => getStackInfo(stack));
}

export function decorateNode(stack, nodeId) {
  const settings = readSettings(stack);
  const node = readNode(stack, nodeId);
  const state = reconstructState(settings, node.sequence);
  const actions = node.actions.map((action, index) => withNodeAvailability(stack, decorateAction(settings, node.player, action, index)));
  const summary = summarizeRange(node, actions);
  const history = node.sequence.map((event, index) => ({
    index,
    player: event.player,
    position: POSITIONS[event.player],
    ...decorateAction(settings, event.player, event, index, true)
  }));

  return {
    stack: getStackInfo(stack),
    nodeId: Number(nodeId),
    player: node.player,
    position: POSITIONS[node.player],
    street: node.street,
    children: node.children,
    sequence: node.sequence,
    path: history.map((event) => event.normalized),
    history,
    browserCards: buildBrowserCards(stack, settings, node.sequence),
    actions,
    state: {
      pot: state.pot,
      potBb: toBb(state.pot, settings),
      currentBet: state.currentBet,
      currentBetBb: toBb(state.currentBet, settings),
      toCall: state.toCallByPlayer[node.player] ?? 0,
      toCallBb: toBb(state.toCallByPlayer[node.player] ?? 0, settings),
      contributions: state.contributions,
      folded: state.folded,
      allIn: state.allIn,
      activePlayers: state.activePlayers
    },
    summary,
    hands: node.hands
  };
}

function buildBrowserCards(stack, settings, sequence) {
  const cards = [];
  let nodeId = 0;

  for (let index = 0; index < sequence.length; index += 1) {
    const event = sequence[index];
    const node = readNode(stack, nodeId);
    const actions = node.actions.map((action, actionIndex) => withNodeAvailability(stack, decorateAction(settings, node.player, action, actionIndex)));
    const normalized = normalizeAction(settings, event.player, event);
    const selectedIndex = actions.findIndex((action) => action.normalized === normalized);
    const selectedAction = selectedIndex >= 0 ? actions[selectedIndex] : decorateAction(settings, event.player, event, selectedIndex, true);

    cards.push({
      index,
      nodeId,
      player: node.player,
      position: POSITIONS[node.player],
      stackBb: settings.handdata.stacks[node.player] / getBb(settings),
      selectedIndex,
      selectedAction,
      actions
    });

    if (selectedIndex < 0 || actions[selectedIndex].node === undefined) break;
    nodeId = actions[selectedIndex].node;
  }

  return cards;
}

export function resolvePath(stack, pathTokens) {
  assertStack(stack);
  if (!Array.isArray(pathTokens)) {
    throw new DataError(400, "path must be an array");
  }

  let nodeId = 0;
  const resolved = [];
  for (const token of pathTokens) {
    const decorated = decorateNode(stack, nodeId);
    const action = decorated.actions.find((candidate) => candidate.normalized === token);
    if (!action || action.node === undefined || action.nodeAvailable === false) {
      return {
        ok: false,
        reason: `Cannot replay ${token} from ${stack}/${nodeId}`,
        node: decorateNode(stack, 0),
        resolvedPath: []
      };
    }
    resolved.push(action.normalized);
    nodeId = action.node;
  }

  return {
    ok: true,
    node: decorateNode(stack, nodeId),
    resolvedPath: resolved
  };
}

export function validateSettings(stack, settings) {
  const stacks = settings?.handdata?.stacks;
  if (!Array.isArray(stacks) || stacks.length !== 8) {
    throw new DataError(500, `${stack} must contain exactly 8 stacks`);
  }
  if (settings.eqmodel?.id !== "chipev" || settings.eqmodel?.raked !== false) {
    throw new DataError(500, `${stack} must be unraked ChipEV`);
  }
  if (settings.handdata?.anteType !== "BB_ANTE_ANTE_FIRST") {
    throw new DataError(500, `${stack} must use BB ante`);
  }
  if (!settings.treeconfig?.preflop?.settings) {
    throw new DataError(500, `${stack} must contain preflop settings`);
  }
}

export function validateNodeShape(stack, nodeId, node) {
  if (!POSITIONS[node.player]) {
    throw new DataError(500, `${stack}/${nodeId} has invalid player`);
  }
  if (node.street !== 0) {
    throw new DataError(500, `${stack}/${nodeId} is not preflop`);
  }
  if (!Array.isArray(node.sequence) || !Array.isArray(node.actions)) {
    throw new DataError(500, `${stack}/${nodeId} has invalid sequence/actions`);
  }
  const handKeys = Object.keys(node.hands ?? {});
  if (handKeys.length !== 169) {
    throw new DataError(500, `${stack}/${nodeId} must contain 169 hands`);
  }
  for (const hand of handKeys) {
    const entry = node.hands[hand];
    if (!Array.isArray(entry.played) || !Array.isArray(entry.evs)) {
      throw new DataError(500, `${stack}/${nodeId}/${hand} has invalid strategy arrays`);
    }
    if (entry.played.length !== node.actions.length || entry.evs.length !== node.actions.length) {
      throw new DataError(500, `${stack}/${nodeId}/${hand} action array length mismatch`);
    }
  }
}

export function nodeExists(stack, nodeId) {
  return fs.existsSync(path.join(DATA_ROOT, stack, "nodes", `${nodeId}.json`));
}

export function getNodeIds(stack) {
  assertStack(stack);
  return fs
    .readdirSync(path.join(DATA_ROOT, stack, "nodes"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => Number(file.replace(".json", "")))
    .sort((a, b) => a - b);
}

export function decorateAction(settings, player, action, index, fromSequence = false) {
  const bb = getBb(settings);
  const stackChips = settings.handdata.stacks[player] ?? settings.handdata.stacks[0];
  const amountBb = action.amount / bb;
  const allIn = action.type === "R" && action.amount >= stackChips * 0.999;
  const normalized = normalizeAction(settings, player, action);
  const label = formatActionLabel(settings, player, action);
  return {
    index,
    type: action.type,
    amount: action.amount,
    amountBb,
    label,
    shortLabel: formatShortActionLabel(settings, player, action),
    normalized,
    isAllIn: allIn,
    isTerminal: !fromSequence && action.node === undefined,
    node: action.node,
    color: actionColor(action.type, allIn)
  };
}

function withNodeAvailability(stack, action) {
  return {
    ...action,
    nodeAvailable: action.node === undefined ? true : nodeExists(stack, action.node)
  };
}

export function normalizeAction(settings, player, action) {
  if (action.type === "F") return "F";
  if (action.type === "C") return "C";
  if (action.type === "R") {
    const stackChips = settings.handdata.stacks[player] ?? settings.handdata.stacks[0];
    if (action.amount >= stackChips * 0.999) return "R_ALLIN";
    return `R_${formatBb(action.amount / getBb(settings))}BB`;
  }
  return `${action.type}_${action.amount}`;
}

export function handComboCount(hand) {
  if (hand.length === 2) return 6;
  return hand.endsWith("s") ? 4 : 12;
}

export function formatBb(value) {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(2))).replace(/\.0+$/, "");
}

function reconstructState(settings, sequence) {
  const stackSize = settings.handdata.stacks[0];
  const contributions = Array(8).fill(0);
  const folded = Array(8).fill(false);
  const allIn = Array(8).fill(false);
  const sb = getSb(settings);
  const bb = getBb(settings);
  const bbAnte = getBbAnte(settings);

  contributions[6] = sb;
  contributions[7] = bb;
  let pot = sb + bb + bbAnte;

  for (const event of sequence) {
    const player = event.player;
    if (event.type === "F") {
      folded[player] = true;
      continue;
    }
    if (event.type === "C") {
      contributions[player] += event.amount;
      pot += event.amount;
    }
    if (event.type === "R") {
      const increment = Math.max(0, event.amount - contributions[player]);
      contributions[player] = Math.max(contributions[player], event.amount);
      pot += increment;
    }
    if (contributions[player] >= stackSize * 0.999) {
      allIn[player] = true;
    }
  }

  const currentBet = Math.max(...contributions);
  const toCallByPlayer = contributions.map((amount) => Math.max(0, currentBet - amount));
  const activePlayers = POSITIONS.map((_, player) => player).filter((player) => !folded[player]);
  return { contributions, folded, allIn, pot, currentBet, toCallByPlayer, activePlayers };
}

function summarizeRange(node, decoratedActions) {
  const totals = decoratedActions.map((action) => ({
    index: action.index,
    label: action.label,
    shortLabel: action.shortLabel,
    normalized: action.normalized,
    type: action.type,
    color: action.color,
    node: action.node,
    combos: 0,
    frequency: 0
  }));
  let denominator = 0;

  for (const [hand, entry] of Object.entries(node.hands)) {
    const combos = handComboCount(hand);
    const weightedCombos = combos * entry.weight;
    denominator += weightedCombos;
    entry.played.forEach((frequency, index) => {
      totals[index].combos += weightedCombos * frequency;
    });
  }

  totals.forEach((action) => {
    action.frequency = denominator > 0 ? action.combos / denominator : 0;
  });

  return {
    rangeCombos: denominator,
    actions: totals
  };
}

function formatActionLabel(settings, player, action) {
  const bb = getBb(settings);
  if (action.type === "F") return "Fold";
  if (action.type === "C") return action.amount === 0 ? "Check" : `Call ${formatBb(action.amount / bb)}`;
  if (action.type === "R") {
    const stackChips = settings.handdata.stacks[player] ?? settings.handdata.stacks[0];
    if (action.amount >= stackChips * 0.999) return `Allin ${formatBb(stackChips / bb)}`;
    return `Raise ${formatBb(action.amount / bb)}`;
  }
  return `${action.type} ${formatBb(action.amount / bb)}`;
}

function formatShortActionLabel(settings, player, action) {
  if (action.type === "F") return "Fold";
  if (action.type === "C") return action.amount === 0 ? "Check" : "Call";
  if (action.type === "R") {
    const stackChips = settings.handdata.stacks[player] ?? settings.handdata.stacks[0];
    return action.amount >= stackChips * 0.999 ? "Allin" : "Raise";
  }
  return action.type;
}

function actionColor(type, allIn) {
  if (type === "F") return "fold";
  if (type === "C") return "call";
  if (type === "R" && allIn) return "allin";
  if (type === "R") return "raise";
  return "neutral";
}

function discoverStacks() {
  return fs
    .readdirSync(DATA_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+bb$/i.test(entry.name))
    .filter((entry) => {
      const stackPath = path.join(DATA_ROOT, entry.name);
      return fs.existsSync(path.join(stackPath, "settings.json")) && fs.existsSync(path.join(stackPath, "nodes"));
    })
    .map((entry) => entry.name)
    .sort((a, b) => Number(a.replace("bb", "")) - Number(b.replace("bb", "")));
}

function getBb(settings) {
  return settings.handdata.blinds[2];
}

function getSb(settings) {
  return settings.handdata.blinds[1];
}

function getBbAnte(settings) {
  return settings.handdata.anteType === "BB_ANTE_ANTE_FIRST" ? settings.handdata.blinds[0] : 0;
}

function toBb(amount, settings) {
  return amount / getBb(settings);
}
