/**
 * EmmaDetailView — thin wrapper around HeroDetailView.
 * Sprite animation removed; center displays floating hero card.
 */

import { HeroDetailView } from './HeroDetailView';

interface EmmaDetailViewProps {
  name: string; rarity: string; rarityLabel: string;
  rarityColor: string; rarityShine: string;
  level: number; ilust: string;
  stats: { hp: number; pAtk: number; mAtk: number; pDef: number; mDef: number; speed: number; expCurrent: number; expMax: number; };
  onClose: () => void;
}

export function EmmaDetailView(props: EmmaDetailViewProps) {
  return <HeroDetailView {...props} />;
}
