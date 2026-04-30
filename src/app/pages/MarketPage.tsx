import { useState } from 'react';
import { useNavigate } from 'react-router';
import { GamePageLayout } from '../components/GamePageLayout';
import { useLanguage } from '../context/LanguageContext';

const F = "'Playfair Display', serif";

type Currency = 'gold' | 'gems';
interface ShopItem {
  id: string; name: string; desc: string; price: number; currency: Currency;
  rarity: string; rarityColor: string; stock: number | null; tag?: string;
}

const ITEMS: ShopItem[] = [
  { id: 'a1', name: 'Hero Shard ×10',  desc: 'Random rare hero shards',   price: 1200,  currency: 'gold', rarity: 'Rare',      rarityColor: '#1877F2', stock: null,  tag: 'Popular' },
  { id: 'a2', name: 'Exp Potion ×5',   desc: 'Boosts hero XP by 500',     price: 800,   currency: 'gold', rarity: 'Common',    rarityColor: '#22C55E', stock: null              },
  { id: 'a3', name: 'Stamina Flask',   desc: 'Restores 120 stamina',       price: 500,   currency: 'gold', rarity: 'Common',    rarityColor: '#22C55E', stock: 20               },
  { id: 'a4', name: 'Enhance Stone',   desc: 'Equipment enhancement +1',  price: 2500,  currency: 'gold', rarity: 'Rare',      rarityColor: '#1877F2', stock: 10               },
  { id: 'b1', name: 'Epic Summon ×3',  desc: '3 guaranteed Epic+ heroes', price: 180,   currency: 'gems', rarity: 'Epic',      rarityColor: '#A855F7', stock: null,  tag: 'Best Value' },
  { id: 'b2', name: 'Mythic Pack',     desc: 'Chance at Mythic hero',     price: 600,   currency: 'gems', rarity: 'Mythic',    rarityColor: '#FF1744', stock: 3,     tag: 'Limited'    },
  { id: 'b3', name: 'Crystal Chest',   desc: 'Random legendary item',     price: 120,   currency: 'gems', rarity: 'Legendary', rarityColor: '#FB923C', stock: null              },
  { id: 'b4', name: 'VIP +1 Boost',   desc: 'Temporary VIP level boost',  price: 300,   currency: 'gems', rarity: 'Epic',      rarityColor: '#A855F7', stock: 1,     tag: 'New'        },
];

const REFRESH_COST = 100;

export default function MarketPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [tab, setTab] = useState<'shop' | 'limited'>('shop');
  const [filter, setFilter] = useState<'all' | 'gold' | 'gems'>('all');
  const [bought, setBought] = useState<Set<string>>(new Set());

  const filtered = ITEMS.filter(it =>
    tab === 'limited'
      ? it.stock !== null
      : filter === 'all' ? true : it.currency === filter
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#030a02' }}>

      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #071206 0%, #030a02 45%, #071005 100%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(50,160,0,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 30% at 50% 100%, rgba(180,140,0,0.14) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* ── Decorative scales ── */}
      <svg style={{ position: 'absolute', left: '50%', top: '8%', transform: 'translateX(-50%)', opacity: 0.04, pointerEvents: 'none', width: 'min(220px, 30vw)' }} viewBox="0 0 160 140">
        <rect x="76" y="10" width="8" height="90" fill="#22C55E"/>
        <rect x="60" y="10" width="40" height="6" rx="3" fill="#22C55E"/>
        <circle cx="80" cy="106" r="18" fill="none" stroke="#22C55E" strokeWidth="6"/>
        <line x1="60" y1="13" x2="10" y2="50" stroke="#22C55E" strokeWidth="3"/>
        <line x1="100" y1="13" x2="150" y2="50" stroke="#22C55E" strokeWidth="3"/>
        <ellipse cx="10" cy="55" rx="22" ry="10" fill="#22C55E"/>
        <ellipse cx="150" cy="55" rx="22" ry="10" fill="#22C55E"/>
      </svg>

      {/* ── Header ── */}
      <div style={{ position: 'absolute', top: '12%', left: 0, right: 0, textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ fontFamily: F, fontSize: 'clamp(13px, 2.2vw, 22px)', fontWeight: 800, color: 'rgba(74,222,128,0.95)', letterSpacing: '0.3em', textShadow: '0 0 24px rgba(50,180,0,0.55), 0 1px 4px rgba(0,0,0,0.9)' }}>
          {t('city.market').toUpperCase()}
        </div>
        <div style={{ marginTop: '4px', fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.18em' }}>
          Resets daily at 00:00 SGT
        </div>
      </div>

      <div style={{ position: 'absolute', top: '19%', left: '8%', right: '8%', height: '1px', zIndex: 10, background: 'linear-gradient(90deg, transparent 0%, rgba(74,222,128,0.5) 20%, rgba(74,222,128,0.8) 50%, rgba(74,222,128,0.5) 80%, transparent 100%)', pointerEvents: 'none' }} />

      {/* ── Tab + filter row ── */}
      <div style={{ position: 'absolute', top: '20.5%', left: '5%', right: '5%', zIndex: 10, display: 'flex', alignItems: 'center', gap: '6px' }}>
        {(['shop', 'limited'] as const).map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            style={{ background: tab === tb ? 'rgba(50,160,0,0.2)' : 'rgba(0,0,0,0.5)', border: `1px solid ${tab === tb ? 'rgba(74,222,128,0.55)' : 'rgba(255,255,255,0.12)'}`, borderRadius: '5px', color: tab === tb ? 'rgba(140,255,160,1)' : 'rgba(255,255,255,0.35)', fontFamily: F, fontSize: 'clamp(7px, 0.9vw, 9px)', padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.1em', transition: 'all 0.2s' }}
          >
            {tb === 'shop' ? 'Daily Shop' : 'Limited'}
          </button>
        ))}
        {tab === 'shop' && (
          <>
            <div style={{ flex: 1 }} />
            {(['all', 'gold', 'gems'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ background: filter === f ? 'rgba(200,160,0,0.2)' : 'rgba(0,0,0,0.4)', border: `1px solid ${filter === f ? 'rgba(245,200,66,0.45)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '5px', color: filter === f ? 'rgba(245,200,100,1)' : 'rgba(255,255,255,0.3)', fontFamily: F, fontSize: 'clamp(6px, 0.75vw, 8px)', padding: '3px 8px', cursor: 'pointer', letterSpacing: '0.08em', transition: 'all 0.2s' }}
              >
                {f === 'all' ? 'All' : f === 'gold' ? '🪙 Gold' : '💎 Gems'}
              </button>
            ))}
          </>
        )}
      </div>

      {/* ── Item grid ── */}
      <div style={{ position: 'absolute', top: '27%', bottom: '9%', left: '5%', right: '5%', zIndex: 10, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(140px,40vw), 1fr))', gap: '8px', paddingBottom: '8px' }}>
          {filtered.map(item => {
            const isSold = item.stock === 0 || bought.has(item.id);
            return (
              <div key={item.id} style={{ background: 'rgba(0,0,0,0.45)', border: `1px solid ${isSold ? 'rgba(255,255,255,0.05)' : `${item.rarityColor}28`}`, borderRadius: '8px', padding: '10px 10px 8px 10px', display: 'flex', flexDirection: 'column', gap: '5px', opacity: isSold ? 0.45 : 1, transition: 'opacity 0.2s' }}>
                {/* Tag */}
                {item.tag && !isSold && (
                  <div style={{ alignSelf: 'flex-start', background: `${item.rarityColor}25`, border: `1px solid ${item.rarityColor}55`, borderRadius: '3px', padding: '1px 6px', fontFamily: F, fontSize: 'clamp(5px, 0.65vw, 7px)', color: item.rarityColor, letterSpacing: '0.1em' }}>
                    {item.tag}
                  </div>
                )}
                {/* Icon placeholder */}
                <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: `${item.rarityColor}18`, border: `1px solid ${item.rarityColor}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: item.rarityColor, opacity: 0.45 }} />
                </div>
                {/* Name */}
                <span style={{ fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', fontWeight: 700, color: isSold ? 'rgba(255,255,255,0.25)' : item.rarityColor, letterSpacing: '0.06em', textAlign: 'center' }}>{item.name}</span>
                <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.75vw, 7.5px)', color: 'rgba(255,255,255,0.28)', textAlign: 'center', lineHeight: 1.3 }}>{item.desc}</span>
                {/* Stock */}
                {item.stock !== null && !isSold && (
                  <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.7vw, 7px)', color: item.stock <= 3 ? '#FF5252' : 'rgba(255,255,255,0.35)', textAlign: 'center', letterSpacing: '0.08em' }}>
                    {item.stock <= 3 ? `Only ${item.stock} left!` : `Stock: ${item.stock}`}
                  </span>
                )}
                {/* Buy button */}
                <button
                  disabled={isSold}
                  onClick={() => setBought(prev => new Set(prev).add(item.id))}
                  style={{ background: isSold ? 'rgba(255,255,255,0.04)' : `${item.rarityColor}22`, border: `1px solid ${isSold ? 'rgba(255,255,255,0.08)' : `${item.rarityColor}50`}`, borderRadius: '5px', color: isSold ? 'rgba(255,255,255,0.2)' : item.rarityColor, fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', letterSpacing: '0.1em', padding: '5px 0', cursor: isSold ? 'default' : 'pointer', transition: 'all 0.15s', marginTop: 'auto' }}
                >
                  {isSold ? 'Sold Out' : `${item.currency === 'gold' ? '🪙' : '💎'} ${item.price.toLocaleString()}`}
                </button>
              </div>
            );
          })}
        </div>

        {/* Refresh row */}
        {tab === 'shop' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '5px', color: 'rgba(255,255,255,0.4)', fontFamily: F, fontSize: 'clamp(6px, 0.75vw, 8px)', letterSpacing: '0.1em', padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M 23,4 L 23,10 L 17,10"/><path d="M 1,20 L 1,14 L 7,14"/><path d="M 3.5,9 A 9,9 0 0 1 20.5,15"/><path d="M 20.5,9 A 9,9 0 0 1 3.5,15" /></svg>
              Refresh · 💎 {REFRESH_COST}
            </button>
          </div>
        )}
      </div>

      <button onClick={() => navigate('/game')} style={{ position: 'absolute', top: '12.5%', left: '4%', zIndex: 20, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '6px', color: 'rgba(255,255,255,0.7)', fontFamily: F, fontSize: 'clamp(7px, 0.9vw, 9px)', letterSpacing: '0.1em', padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M 7,1 L 3,5 L 7,9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back
      </button>

      <GamePageLayout activeTab="city" />
    </div>
  );
}
