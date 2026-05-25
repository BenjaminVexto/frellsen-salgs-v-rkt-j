import { useSyncExternalStore } from "react";

export type ImportKind = "visma" | "anden";

export type ImportRunnerState = {
  running: boolean;
  progress: number;
  label: string;
  kind: ImportKind | null;
  startedAt: number | null;
  finishedAt: number | null;
  // Arbitrary post-import payload (result + helper maps) so the
  // post-import UI (mass assignment etc.) survives navigation.
  postState: unknown | null;
};

type Listener = () => void;

let state: ImportRunnerState = {
  running: false,
  progress: 0,
  label: "",
  kind: null,
  startedAt: null,
  finishedAt: null,
  postState: null,
};

const listeners = new Set<Listener>();
function notify() {
  for (const l of listeners) l();
}

export const importRunner = {
  get(): ImportRunnerState {
    return state;
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  isBusy(): boolean {
    return state.running;
  },
  start(kind: ImportKind) {
    state = {
      running: true,
      progress: 0,
      label: "Forbereder…",
      kind,
      startedAt: Date.now(),
      finishedAt: null,
      postState: null,
    };
    notify();
  },
  setProgress(p: number) {
    if (state.progress === p) return;
    state = { ...state, progress: p };
    notify();
  },
  setLabel(l: string) {
    if (state.label === l) return;
    state = { ...state, label: l };
    notify();
  },
  setPostState(p: unknown) {
    state = { ...state, postState: p };
    notify();
  },
  finish(label: string, postState?: unknown) {
    state = {
      ...state,
      running: false,
      progress: 100,
      label,
      finishedAt: Date.now(),
      postState: postState !== undefined ? postState : state.postState,
    };
    notify();
  },
  fail(label: string) {
    state = {
      ...state,
      running: false,
      label,
      finishedAt: Date.now(),
    };
    notify();
  },
  reset() {
    state = {
      running: false,
      progress: 0,
      label: "",
      kind: null,
      startedAt: null,
      finishedAt: null,
      postState: null,
    };
    notify();
  },
};

export function useImportRunner(): ImportRunnerState {
  return useSyncExternalStore(
    importRunner.subscribe,
    importRunner.get,
    importRunner.get,
  );
}

// Warn the user if they try to close the tab while an import is running.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (importRunner.isBusy()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}
