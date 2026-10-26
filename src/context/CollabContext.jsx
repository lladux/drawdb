import { createContext } from "react";

// No-op stand-in for real-time collaboration. Nothing provides this context,
// so consumers always get these defaults.
export const CollabContext = createContext({
  emitDelta: () => {},
  emitAwareness: () => {},
  isApplyingRemoteRef: { current: false },
});
