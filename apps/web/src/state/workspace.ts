import { create } from "zustand";

type State = {
  workspace: string | null;
  setWorkspace: (slug: string | null) => void;
};

const STORAGE_KEY = "brain.workspace";

function load(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export const useWorkspace = create<State>((set) => ({
  workspace: load(),
  setWorkspace: (slug) => {
    if (slug) localStorage.setItem(STORAGE_KEY, slug);
    else localStorage.removeItem(STORAGE_KEY);
    set({ workspace: slug });
  },
}));
