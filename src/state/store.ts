import { create } from "zustand";

export interface AppState {
  engineReady: boolean;
}

export const useAppStore = create<AppState>()(() => ({
  engineReady: true,
}));
