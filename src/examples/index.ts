/** Beispielnetze. PLATZHALTER. */
import type { NetDoc } from '../model/types';

export interface ExampleInfo {
  id: string;
  title: string;
  description: string;
  category: 'Grundlagen' | 'Klassiker' | 'Zeit & Zufall' | 'Original-HPSim';
  build: () => NetDoc;
}

export const EXAMPLES: ExampleInfo[] = [];
