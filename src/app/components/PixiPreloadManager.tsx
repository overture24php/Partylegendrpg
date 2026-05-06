/**
 * PixiPreloadManager — imperatively pre-warms all PixiJS Applications.
 *
 * Returns null (zero DOM output). Calls prewarmObtained + prewarmGallery once
 * hero data is available. Each prewarm function:
 *   1. Creates the Application using window.innerWidth / innerHeight
 *   2. Builds all card nodes into the scene graph
 *   3. Staggers overlay canvas creation (2 per rAF) and forces
 *      renderer.render() each batch → textures uploaded to GPU immediately
 *
 * By the time the user first navigates to HeroPage the Applications are already
 * created, cards are built, and all textures are on the GPU. HeroPage just
 * reattaches the canvas — zero init cost, zero first-frame drop.
 */

import { useEffect, useMemo } from 'react';
import { useHero }            from '../context/HeroContext';
import { HERO_GALLERY, getHeroIlust } from '../data/heroGallery';
import { HERO_RARITIES }      from './HeroCard';
import { prewarmObtained, HeroData as PixiHeroData } from './PixiObtainedGrid';
import { prewarmGallery, GalleryHeroData }           from './PixiGalleryGrid';

function normRarity(r: string): string {
  const map: Record<string, string> = {
    C:'common', B:'rare', A:'epic', S:'legendary', SS:'mythic',
    common:'common', rare:'rare', epic:'epic', legendary:'legendary', mythic:'mythic',
  };
  return map[r] ?? 'common';
}

export function PixiPreloadManager() {
  const { ownedHeroes, isLoading } = useHero();

  // ── Obtained heroes (same shape as HeroPage) ─────────────────────────────
  const pixiHeroes = useMemo<PixiHeroData[]>(() => {
    if (isLoading) return [];
    return ownedHeroes.map(oh => {
      const rar = normRarity(oh.def.rarity);
      return {
        heroId:    oh.playerHero.hero_id,
        name:      oh.def.name ?? oh.playerHero.hero_id,
        rarity:    rar,
        heroType:  oh.def.hero_type ?? '',
        level:     oh.playerHero.level ?? 1,
        stars:     oh.playerHero.stars ?? (HERO_RARITIES.find(r => r.id === rar)?.stars ?? 1),
        illustUrl: getHeroIlust(oh.playerHero.hero_id) ?? '',
      };
    });
  }, [isLoading, ownedHeroes]);

  // ── Gallery heroes (same shape as HeroPage) ───────────────────────────────
  const galleryHeroes = useMemo<GalleryHeroData[]>(() => {
    if (isLoading) return [];
    return HERO_GALLERY.map(h => {
      const hasIllust = !!(h.ilust?.trim());
      const isLocked  = !hasIllust;
      const rar       = normRarity(h.rarity);
      const owned     = ownedHeroes.find(oh => oh.playerHero.hero_id === h.heroId);
      const heroCfg   = HERO_RARITIES.find(r => r.id === rar) ?? HERO_RARITIES[4];
      return {
        heroId:    h.heroId,
        name:      h.name,
        rarity:    rar,
        heroType:  h.heroType,
        level:     owned?.playerHero.level ?? 1,
        stars:     owned?.playerHero.stars ?? heroCfg.stars,
        illustUrl: isLocked ? '' : (h.ilust ?? ''),
        isLocked,
      };
    });
  }, [isLoading, ownedHeroes]);

  // ── Trigger prewarm once data is ready ───────────────────────────────────
  useEffect(() => {
    if (isLoading) return;
    // Defer slightly so the LoadingPage animation frame budget isn't touched
    const id = requestAnimationFrame(() => {
      prewarmObtained(pixiHeroes);
      prewarmGallery(galleryHeroes);
    });
    return () => cancelAnimationFrame(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]); // run once after loading completes

  return null; // zero DOM output — no React component duplication
}
