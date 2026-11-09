import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import type { NotifSound } from '../api/types';

/**
 * Sons das notificações (8 bits, gerados por scripts/gen_sounds.py).
 *
 * No push, quem toca é o sistema: o Android usa o som do canal `gp_<som>` e o
 * iOS o arquivo `gp_<som>.wav` embutido no app (plugin expo-notifications no
 * app.json). Aqui é só a prévia que toca quando você escolhe no Perfil.
 */
export const SOUNDS: { id: NotifSound; label: string }[] = [
  { id: 'levelup', label: 'LEVEL UP' },
  { id: 'bip', label: 'BIP BIP' },
  { id: 'power', label: 'POWER-UP' },
  { id: 'mudo', label: 'SEM SOM' },
];

export const DEFAULT_SOUND: NotifSound = 'levelup';

const FILES = {
  levelup: require('../../assets/sounds/gp_levelup.wav'),
  bip: require('../../assets/sounds/gp_bip.wav'),
  power: require('../../assets/sounds/gp_power.wav'),
} as const;

let player: AudioPlayer | null = null;

export function previewSound(id: NotifSound) {
  try {
    player?.remove();
    player = null;
    if (id === 'mudo') return;
    player = createAudioPlayer(FILES[id]);
    player.play();
  } catch {
    // sem saída de áudio (ex.: navegador bloqueou): só não toca
  }
}
