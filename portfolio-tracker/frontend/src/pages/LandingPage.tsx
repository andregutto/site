import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import GoogleLogo from '../components/GoogleLogo'
import { useI18n } from '../contexts/I18nContext'
import { supabase } from '../lib/supabase'
import LanguageSelector from '../components/LanguageSelector'

const DARK = '#0D0D0D'
const GOLD = '#C8B89A'

// Institution names shown in the marquee are proper nouns: not translated.
const INSTITUTIONS = [
  'B3', 'Itaú', 'XP Investimentos', 'BTG Pactual', 'Nubank', 'Rico', 'Clear',
  'BNP Paribas', 'Société Générale', 'Crédit Agricole', 'BoursoBank', 'Trade Republic',
  'Millennium bcp', 'Caixa Geral de Depósitos', 'Novo Banco', 'ActivoBank',
  'DEGIRO', 'Interactive Brokers', 'Trading 212', 'Revolut', 'N26',
]

const CSS = `
  .lv3{background:#FAF8F4;color:rgba(13,13,13,.92);font-family:'DM Sans',system-ui,sans-serif;overflow-x:clip}
  .lv3 a{text-decoration:none;color:inherit}
  .lv3 .wrap{max-width:1180px;margin:0 auto;padding:0 24px}
  .lv3 .eyebrow{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:rgba(13,13,13,.55);display:flex;align-items:center;gap:9px}
  .lv3 .eyebrow .dot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
  .lv3 .rv{opacity:0;transform:translateY(24px);transition:opacity .7s cubic-bezier(.22,.61,.36,1),transform .7s cubic-bezier(.22,.61,.36,1)}
  .lv3 .rv.on{opacity:1;transform:none}
  .lv3 .av{width:26px;height:26px;border-radius:50%;background:#0D0D0D;color:#C8B89A;font-size:9px;font-weight:600;letter-spacing:.04em;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .lv3 .av.lt{background:#fff;color:rgba(13,13,13,.55);border:1px solid rgba(13,13,13,.09)}

  .lv3 .hero{position:relative;min-height:100svh;background:#0D0D0D;overflow:hidden;display:flex;align-items:flex-end}
  .lv3 .hero-bg{position:absolute;inset:0;background:url('/brand/imagery/01-broto-floresta.jpg') center 35%/cover;filter:brightness(.30) sepia(.28) saturate(1.15);animation:lv3kb 26s cubic-bezier(.22,.61,.36,1) infinite alternate}
  @keyframes lv3kb{from{transform:scale(1)}to{transform:scale(1.06)}}
  .lv3 .hero-fade{position:absolute;inset:0;background:linear-gradient(100deg,rgba(6,8,14,.82) 0%,rgba(6,8,14,.45) 48%,rgba(6,8,14,.15) 100%)}
  .lv3 .hero-fade2{position:absolute;bottom:0;left:0;right:0;height:40%;background:linear-gradient(to top,rgba(8,10,16,.9),transparent)}
  .lv3 .hero-grid{position:relative;z-index:2;width:100%;max-width:1180px;margin:0 auto;padding:120px 24px 0}
  .lv3 .hero-copy{max-width:540px;padding-bottom:clamp(56px,9vh,110px)}
  .lv3 .hero-eb{display:inline-flex;align-items:center;gap:9px;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:rgba(255,255,255,.66)}
  .lv3 .hero-eb .dot{width:5px;height:5px;border-radius:50%;background:#C8B89A}
  .lv3 .hero h1{font-family:'Playfair Display',serif;font-weight:400;font-size:clamp(2.4rem,4.6vw,3.9rem);line-height:1.08;color:#fff;letter-spacing:-.5px;margin:22px 0 0}
  .lv3 .hero h1 em{font-style:italic;color:#C8B89A}
  .lv3 .hero .sub{font-size:clamp(15px,1.6vw,16.5px);line-height:1.7;color:rgba(255,255,255,.66);max-width:420px;margin-top:18px}
  .lv3 .hero-ctas{display:flex;align-items:center;gap:26px;flex-wrap:wrap;margin-top:34px}
  .lv3 .btn-gold{font-size:12px;letter-spacing:.16em;text-transform:uppercase;background:#C8B89A;color:#0D0D0D;padding:16px 38px;border-radius:999px;box-shadow:0 8px 32px rgba(200,184,154,.28);transition:all .28s;display:inline-block}
  .lv3 .btn-gold:hover{background:#D6C8AC}
  .lv3 .lnk{font-size:13px;color:rgba(255,255,255,.78);border-bottom:1px solid rgba(255,255,255,.32);padding-bottom:3px;transition:color .28s}
  .lv3 .lnk:hover{color:#fff}
  .lv3 .assure{font-size:11.5px;color:rgba(255,255,255,.42);margin-top:18px;letter-spacing:.04em}

  .lv3 .hero-mocks{position:absolute;inset:0;z-index:1;pointer-events:none}
  .lv3 .laptop{position:absolute;bottom:0;right:-18vw;width:55vw;height:82%;border:12px solid #1C1C1E;border-bottom:none;border-radius:18px 18px 0 0;background:#F4F2EE;box-shadow:0 0 0 1px rgba(255,255,255,.06) inset,-16px 0 60px rgba(0,0,0,.45);overflow:hidden}
  .lv3 .lp-in{padding:14px 18px;height:100%;display:flex;flex-direction:column;gap:9px}
  .lv3 .lp-head{display:flex;align-items:center;gap:8px}
  .lv3 .lp-head img{width:16px;height:16px}
  .lv3 .lp-head span.wm{font-family:'Tenor Sans',serif;font-size:11px;letter-spacing:.28em;color:#0D0D0D}
  .lv3 .lp-div{width:1px;height:14px;background:rgba(13,13,13,.14)}
  .lv3 .lp-cap{font-family:'Tenor Sans',serif;font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;color:rgba(13,13,13,.45)}
  .lv3 .lp-head .tabs{flex:1;display:flex;justify-content:center;gap:4px}
  .lv3 .lp-head .tabs i{font-style:normal;font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;padding:4px 10px;border-radius:99px;color:rgba(13,13,13,.5)}
  .lv3 .lp-head .tabs i.on{background:#0D0D0D;color:#fff}
  .lv3 .lp-subnav{display:flex;justify-content:center;gap:18px;border-bottom:1px solid rgba(13,13,13,.07);padding-bottom:6px;margin-top:-2px}
  .lv3 .lp-subnav i{font-style:normal;font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(13,13,13,.42)}
  .lv3 .lp-subnav i.on{color:#0D0D0D;border-bottom:2px solid #0D0D0D;padding-bottom:4px;margin-bottom:-6px}
  .lv3 .lp-toolbar{display:flex;justify-content:space-between;align-items:center}
  .lv3 .lp-seg{display:flex;border:1px solid rgba(13,13,13,.14);border-radius:3px;overflow:hidden;background:#fff}
  .lv3 .lp-seg i{font-style:normal;font-size:8px;letter-spacing:.06em;padding:3px 9px;color:rgba(13,13,13,.55)}
  .lv3 .lp-seg i.on{background:#0D0D0D;color:#fff}
  .lv3 .lp-total{background:#fff;border:1px solid rgba(200,184,154,.4);border-radius:12px;padding:12px 15px;box-shadow:0 2px 14px rgba(200,184,154,.15)}
  .lv3 .lp-total .lb{font-size:8.5px;font-weight:600;letter-spacing:.26em;text-transform:uppercase;color:#8C6A28}
  .lv3 .lp-total .v{font-size:23px;color:#0D0D0D;margin-top:3px}
  .lv3 .lp-total .d{font-size:11px;color:#1F8A5B;margin-top:2px}
  .lv3 .lp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px;padding-top:9px;border-top:1px solid rgba(13,13,13,.07)}
  .lv3 .lp-kpis p{font-size:7.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:rgba(13,13,13,.55);margin:0}
  .lv3 .lp-kpis p.k{font-size:11.5px;font-weight:400;letter-spacing:.02em;text-transform:none;color:#0D0D0D;margin-top:2px}
  .lv3 .lp-indices{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:9px;padding-top:8px;border-top:1px solid rgba(13,13,13,.06)}
  .lv3 .lp-indices p{font-size:7px;letter-spacing:.14em;text-transform:uppercase;color:rgba(13,13,13,.4);margin:0}
  .lv3 .lp-indices p.k{font-size:10.5px;letter-spacing:0;text-transform:none;color:#0D0D0D;margin-top:1px}
  .lv3 .lp-indices p.d{font-size:8px;letter-spacing:0;text-transform:none;margin-top:1px}
  .lv3 .lp-indices p.d i{font-style:normal;color:rgba(13,13,13,.35)}
  .lv3 .up{color:#1F8A5B!important}.lv3 .dn{color:#D63B2F!important}
  .lv3 .lp-card{background:#fff;border:1px solid rgba(13,13,13,.09);border-radius:12px;padding:11px 13px;overflow:hidden}
  .lv3 .lp-lb{font-size:8.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:rgba(13,13,13,.55)}
  .lv3 .alloc{display:flex;align-items:center;gap:26px;margin-top:8px}
  .lv3 .alloc .legend{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:6px 32px;font-size:10px;color:rgba(13,13,13,.75)}
  .lv3 .alloc .legend i{font-style:normal;display:flex;align-items:center;gap:6px}
  .lv3 .alloc .legend b{width:7px;height:7px;border-radius:50%;font-weight:400;flex-shrink:0}
  .lv3 .alloc .legend em{font-style:italic;color:rgba(13,13,13,.4);font-size:8.5px;margin-left:3px}
  .lv3 .donut circle{fill:none;stroke-width:12;transform-origin:center;transform:rotate(-90deg)}
  .lv3 .donut .seg{stroke-dasharray:0 164;transition:stroke-dasharray 1.4s cubic-bezier(.22,.61,.36,1)}
  .lv3 .draw{stroke-dasharray:var(--len,900px);stroke-dashoffset:var(--len,900px);animation:lv3draw 7s cubic-bezier(.22,.61,.36,1) infinite}
  @keyframes lv3draw{0%{stroke-dashoffset:var(--len,900px)}32%{stroke-dashoffset:0}86%{stroke-dashoffset:0;opacity:1}94%{opacity:0}100%{stroke-dashoffset:var(--len,900px);opacity:1}}
  .lv3 .lp-months{display:flex;justify-content:space-between;margin-top:3px}
  .lv3 .lp-months i{font-style:normal;font-size:7px;color:rgba(13,13,13,.35)}
  .lv3 .lp-table{padding:0}
  .lv3 .lp-table .tr{display:grid;grid-template-columns:1.4fr 1.2fr 1fr .9fr;padding:5px 13px;border-bottom:1px solid rgba(13,13,13,.04);font-size:9.5px;color:#0D0D0D}
  .lv3 .lp-table .tr span:nth-child(2){color:rgba(13,13,13,.5)}
  .lv3 .lp-table .tr:last-child{border-bottom:none}
  .lv3 .lp-table .th{background:rgba(248,247,245,.9);font-size:7.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(13,13,13,.38);padding:6px 13px}

  .lv3 .phone{position:absolute;bottom:0;right:calc(37vw - 50px);width:260px;height:520px;border:9px solid #1C1C1E;border-radius:50px;background:#F4F4F4;box-shadow:0 0 0 1px rgba(255,255,255,.08) inset,0 32px 80px rgba(0,0,0,.65),0 0 40px rgba(200,184,154,.10);overflow:hidden;z-index:3;pointer-events:auto}
  .lv3 .ph-island{position:absolute;top:9px;left:50%;transform:translateX(-50%);width:52px;height:14px;border-radius:8px;background:#000;z-index:9}
  .lv3 .ph-nav{position:absolute;top:0;left:0;right:0;height:58px;background:#fff;border-bottom:1px solid rgba(13,13,13,.09);display:flex;align-items:flex-end;padding:0 12px 7px;gap:6px;z-index:8}
  .lv3 .ph-nav img{width:13px;height:13px}
  .lv3 .ph-nav span{font-family:'Tenor Sans',serif;font-size:9.5px;letter-spacing:.28em;color:#0D0D0D}
  .lv3 .ph-nav .av{margin-left:auto;width:19px;height:19px;font-size:6.5px}
  .lv3 .ph-screens{position:absolute;inset:0}
  .lv3 .ph-s{position:absolute;inset:0;opacity:0;z-index:1;transition:opacity .35s cubic-bezier(.22,.61,.36,1);padding:68px 12px 14px;display:flex;flex-direction:column;gap:8px;background:#F4F4F4}
  .lv3 .ph-s.on{opacity:1;z-index:3}
  .lv3 .ph-tag{font-size:8px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:rgba(13,13,13,.55);margin:0}
  .lv3 .ph-title{font-family:'Tenor Sans',serif;font-size:16px;color:#0D0D0D;margin:1px 0 0}
  .lv3 .ph-card{background:#fff;border:1px solid rgba(13,13,13,.09);border-radius:12px;padding:10px 12px}
  .lv3 .ph-dots{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:5px;z-index:9}
  .lv3 .ph-dots i{width:5px;height:5px;border-radius:50%;background:rgba(13,13,13,.18);transition:background .4s}
  .lv3 .ph-dots i.on{background:#0D0D0D}
  .lv3 .pbar{height:5px;border-radius:99px;background:rgba(13,13,13,.08);overflow:hidden;margin-top:7px}
  .lv3 .pbar>i{display:block;height:100%;border-radius:99px;width:0;transition:width 1.3s cubic-bezier(.22,.61,.36,1)}
  .lv3 .ph-s.on .pbar>i{width:var(--w)}
  .lv3 .ph-kpis{display:grid;grid-template-columns:1fr 1fr;gap:7px 10px}
  .lv3 .ph-kpis p{font-size:7.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:rgba(13,13,13,.55);margin:0}
  .lv3 .ph-kpis p.k{font-size:12px;font-weight:400;letter-spacing:0;text-transform:none;color:#0D0D0D;margin-top:1px}
  .lv3 .ph-r{display:flex;justify-content:space-between;padding:5.5px 0;border-bottom:1px solid rgba(13,13,13,.05);font-size:10.5px;color:#0D0D0D}
  .lv3 .ph-pill{margin-left:auto;font-size:7px;letter-spacing:.08em;text-transform:uppercase;color:#E8A020;background:rgba(232,160,32,.1);border-radius:99px;padding:2px 7px}
  .lv3 .typing{display:inline-flex;gap:3px;align-items:center}
  .lv3 .typing i{width:4px;height:4px;border-radius:50%;background:rgba(13,13,13,.55);animation:lv3ty 1.2s infinite}
  .lv3 .typing i:nth-child(2){animation-delay:.18s}.lv3 .typing i:nth-child(3){animation-delay:.36s}
  @keyframes lv3ty{0%,60%,100%{opacity:.25;transform:none}30%{opacity:1;transform:translateY(-2px)}}

  @media(max-width:900px){
    .lv3 .hero{flex-direction:column;align-items:stretch}
    .lv3 .hero-grid{order:1;padding-top:104px;min-height:100svh;display:flex;align-items:center;box-sizing:border-box}
    .lv3 .hero-copy{max-width:none;padding-bottom:48px}
    .lv3 .hero h1{margin-top:28px}
    .lv3 .hero .sub{margin-top:22px}
    .lv3 .assure{margin-top:24px}
    .lv3 .hero-mocks{position:relative;inset:auto;order:2;height:600px;margin-top:64px;pointer-events:auto}
    .lv3 .laptop{display:none}
    .lv3 .phone{left:50%;right:auto;transform:translateX(-50%);width:290px;height:580px}
    .lv3 .hero-ctas{flex-direction:column;align-items:stretch;gap:16px;margin-top:40px}
    .lv3 .btn-gold{text-align:center}
    .lv3 .lnk{align-self:center}
  }

  .lv3 .trust{background:#0D0D0D;border-top:1px solid rgba(255,255,255,.07)}
  .lv3 .trust-in{max-width:1180px;margin:0 auto;padding:20px 24px;display:flex;flex-wrap:wrap;justify-content:center;gap:12px 42px}
  .lv3 .trust span{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.45)}
  .lv3 .trust b{color:#C8B89A;font-weight:400}

  .lv3 .logos{background:#fff;border-top:1px solid rgba(13,13,13,.09);border-bottom:1px solid rgba(13,13,13,.09);padding:clamp(36px,5vw,52px) 0}
  .lv3 .logos .cap{text-align:center;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(13,13,13,.55);margin-bottom:26px;padding:0 24px}
  .lv3 .marq{overflow:hidden;position:relative;mask-image:linear-gradient(to right,transparent,#000 8%,#000 92%,transparent);-webkit-mask-image:linear-gradient(to right,transparent,#000 8%,#000 92%,transparent)}
  .lv3 .marq-track{display:flex;align-items:center;gap:44px;width:max-content;animation:lv3marq 60s linear infinite}
  .lv3 .marq:hover .marq-track{animation-play-state:paused}
  .lv3 .wm2{font-family:'Tenor Sans',serif;font-size:clamp(14px,1.5vw,16.5px);letter-spacing:.06em;color:rgba(13,13,13,.34);white-space:nowrap}
  .lv3 .wm-dot{width:4px;height:4px;border-radius:50%;background:rgba(200,184,154,.55);flex-shrink:0}
  @keyframes lv3marq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
  @media (prefers-reduced-motion: reduce){.lv3 .marq-track{animation:none;flex-wrap:wrap;justify-content:center;width:auto}.lv3 .draw{animation:none;stroke-dashoffset:0}}

  .lv3 .acts{padding:clamp(84px,10vw,140px) 0 0}
  .lv3 .acts-head h2{font-family:'Playfair Display',serif;font-weight:400;font-size:clamp(1.8rem,3.4vw,2.6rem);line-height:1.15;letter-spacing:-.3px;max-width:600px;margin-top:16px}
  .lv3 .act{display:grid;grid-template-columns:1fr 1fr;gap:clamp(36px,6vw,90px);align-items:center;margin-top:clamp(72px,9vw,120px)}
  .lv3 .act.flip .vis{order:-1}
  .lv3 .act h3{font-family:'Playfair Display',serif;font-weight:400;font-size:clamp(1.45rem,2.5vw,2rem);line-height:1.2;margin:14px 0 12px;letter-spacing:-.2px}
  .lv3 .act .desc{font-size:15px;line-height:1.8;color:rgba(13,13,13,.75);max-width:400px}
  .lv3 .act ul{list-style:none;margin:18px 0 0;padding:0;display:flex;flex-direction:column;gap:9px}
  .lv3 .act ul li{font-size:13.5px;color:rgba(13,13,13,.75);display:flex;gap:10px;align-items:baseline}
  .lv3 .act ul li::before{content:'';width:4px;height:4px;border-radius:50%;background:#C8B89A;flex-shrink:0;transform:translateY(-2px)}
  .lv3 .vis{display:flex;justify-content:center}
  .lv3 .stage{background:#F1EDE5;border-radius:20px;padding:clamp(20px,3.2vw,36px);box-shadow:0 30px 70px -28px rgba(13,13,13,.28);width:100%;display:flex;justify-content:center}
  .lv3 .band .stage{background:#FAF8F4}
  .lv3 .shot{background:#F7F5F1;border:1px solid rgba(13,13,13,.09);border-radius:16px;overflow:hidden;width:100%;max-width:350px;box-shadow:0 18px 56px rgba(0,0,0,.10)}
  .lv3 .shot-nav{height:42px;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:1px solid rgba(13,13,13,.09);background:#fff}
  .lv3 .shot-nav span{font-family:'Tenor Sans',serif;font-size:11.5px;letter-spacing:.28em;color:#0D0D0D}
  .lv3 .shot-nav .av{margin-left:auto;width:23px;height:23px;font-size:8px}
  .lv3 .shot-body{padding:13px 14px 16px;display:flex;flex-direction:column;gap:8px}
  .lv3 .mcard{background:#fff;border:1px solid rgba(13,13,13,.09);border-radius:12px;padding:11px 13px}
  .lv3 .mlb{font-size:8.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:rgba(13,13,13,.55)}
  .lv3 .mval{font-family:'Tenor Sans',serif;font-size:18px;color:#0D0D0D;margin-top:2px}
  .lv3 .fillbar{height:5px;border-radius:99px;background:rgba(13,13,13,.07);overflow:hidden;margin-top:7px}
  .lv3 .fillbar>i{display:block;height:100%;border-radius:99px;width:0;transition:width 1.4s cubic-bezier(.22,.61,.36,1) .3s}
  .lv3 .on .fillbar>i{width:var(--w)}
  .lv3 .feedmsg{opacity:0;transform:translateY(10px);animation:lv3msg 9s cubic-bezier(.22,.61,.36,1) infinite;animation-play-state:paused}
  .lv3 .on .feedmsg{animation-play-state:running}
  .lv3 .feedmsg:nth-child(2){animation-delay:.9s}
  .lv3 .feedmsg:nth-child(3){animation-delay:1.8s}
  @keyframes lv3msg{0%{opacity:0;transform:translateY(10px)}8%,88%{opacity:1;transform:none}96%,100%{opacity:0;transform:translateY(10px)}}
  .lv3 .band{padding:clamp(64px,8vw,100px) 0;margin-top:clamp(72px,9vw,120px)}
  .lv3 .band.beige{background:#F1EDE5}
  .lv3 .band.white{background:#fff;border-top:1px solid rgba(13,13,13,.09);border-bottom:1px solid rgba(13,13,13,.09)}
  .lv3 .band .act{margin-top:0}

  .lv3 .day-chips{display:flex;gap:6px}
  .lv3 .day-chips i{font-style:normal;font-size:9px;letter-spacing:.04em;padding:4px 11px;border-radius:999px;border:1px solid rgba(13,13,13,.09);color:rgba(13,13,13,.55);background:#fff}
  .lv3 .day-chips i.c1.on{background:rgba(214,59,47,.1);border-color:#D63B2F;color:#D63B2F}
  .lv3 .day-chips i.c2{color:#1B4FD8}
  .lv3 .day-chips i.c3{color:#1F8A5B}
  .lv3 .trip-map{position:relative;height:148px;padding:0;overflow:hidden}
  .lv3 .pin{position:absolute;width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg) translate(-50%,-50%);border:2px solid rgba(255,255,255,.95);box-shadow:0 2px 6px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center}
  .lv3 .pin span{transform:rotate(45deg);font-size:10px;font-weight:600;color:#fff}
  .lv3 .pin.p1{background:#D63B2F}.lv3 .pin.p2{background:#1B4FD8}.lv3 .pin.p3{background:#1F8A5B}
  .lv3 .it-row{display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid rgba(13,13,13,.05)}
  .lv3 .it-row .it-mid{flex:1;min-width:0}
  .lv3 .day-badge{width:17px;height:17px;border-radius:50%;color:#fff;font-size:8.5px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .lv3 .it-name{font-size:11px;font-weight:600;color:#0D0D0D;line-height:1.3;margin:0}
  .lv3 .it-sub{font-size:9px;color:rgba(13,13,13,.55);margin:1px 0 0}
  .lv3 .it-open{font-size:11px;color:rgba(13,13,13,.55);flex-shrink:0}

  .lv3 .quote{position:relative;margin-top:clamp(90px,11vw,150px);padding:clamp(84px,11vw,140px) 24px;overflow:hidden}
  .lv3 .quote .bg{position:absolute;inset:0;background:url('/brand/imagery/03-capins-dourados.jpg') center/cover;filter:brightness(.38) sepia(.30) saturate(1.25)}
  .lv3 .quote .in{position:relative;text-align:center;max-width:680px;margin:0 auto}
  .lv3 .quote .rule{width:34px;height:1px;background:#C8B89A;margin:0 auto 28px}
  .lv3 .quote .q{font-family:'Playfair Display',serif;font-style:italic;font-size:clamp(1.5rem,3.4vw,2.4rem);color:#fff;line-height:1.45}
  .lv3 .quote .a{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.45);margin-top:24px}

  .lv3 .how{border-top:1px solid rgba(13,13,13,.09);border-bottom:1px solid rgba(13,13,13,.09);background:#fff;padding:clamp(70px,9vw,110px) 0}
  .lv3 .how h2{font-family:'Playfair Display',serif;font-weight:400;font-size:clamp(1.7rem,3vw,2.3rem);margin-top:14px}
  .lv3 .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:52px;position:relative}
  .lv3 .steps::before{content:'';position:absolute;top:34px;left:11%;right:11%;height:1px;background:rgba(13,13,13,.09)}
  .lv3 .steps .prog{position:absolute;top:34px;left:11%;height:1px;background:#C8B89A;width:0;transition:width 1.1s cubic-bezier(.22,.61,.36,1)}
  .lv3 .step{position:relative;text-align:center;padding:0 14px}
  .lv3 .step .ball{width:68px;height:68px;border-radius:50%;background:#FAF8F4;border:1px solid rgba(13,13,13,.09);margin:0 auto;display:flex;align-items:center;justify-content:center;position:relative;z-index:2;transition:all .5s cubic-bezier(.22,.61,.36,1)}
  .lv3 .step .ball svg{width:24px;height:24px;stroke:rgba(13,13,13,.55);transition:stroke .5s}
  .lv3 .step.live .ball{background:#0D0D0D;border-color:#0D0D0D;box-shadow:0 10px 30px rgba(13,13,13,.25)}
  .lv3 .step.live .ball svg{stroke:#C8B89A}
  .lv3 .step h3{font-family:'Tenor Sans',serif;font-weight:400;font-size:18px;margin:20px 0 9px;letter-spacing:.02em;color:rgba(13,13,13,.92)}
  .lv3 .step p{font-size:14.5px;line-height:1.75;color:rgba(13,13,13,.75)}
  @media(max-width:860px){
    .lv3 .steps{grid-template-columns:1fr;gap:38px}
    .lv3 .steps::before,.lv3 .steps .prog{display:none}
    .lv3 .step{display:grid;grid-template-columns:68px 1fr;gap:6px 18px;text-align:left;align-items:start}
    .lv3 .step .ball{margin:0;grid-row:1 / span 2}
    .lv3 .step h3{margin-top:8px;grid-column:2}
    .lv3 .step p{grid-column:2}
    .lv3 .act{grid-template-columns:1fr}
    .lv3 .act.flip .vis{order:0}
  }

  .lv3 .faq{max-width:720px;margin:0 auto;padding:clamp(76px,9vw,120px) 24px}
  .lv3 .faq h2{font-family:'Playfair Display',serif;font-weight:400;font-size:clamp(1.6rem,2.8vw,2.2rem);margin-top:14px}
  .lv3 .faq .list{margin-top:40px}
  .lv3 .faq details{border-top:1px solid rgba(13,13,13,.09)}
  .lv3 .faq details:last-child{border-bottom:1px solid rgba(13,13,13,.09)}
  .lv3 .faq summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:18px;padding:21px 0;font-size:15px;color:rgba(13,13,13,.92)}
  .lv3 .faq summary::-webkit-details-marker{display:none}
  .lv3 .faq summary .n{font-family:'Playfair Display',serif;font-size:17px;color:rgba(13,13,13,.18);width:26px;flex-shrink:0}
  .lv3 .faq summary .chev{margin-left:auto;transition:transform .28s;flex-shrink:0}
  .lv3 .faq details[open] summary .chev{transform:rotate(180deg)}
  .lv3 .faq .ans{padding:0 0 22px 44px;font-size:14.5px;line-height:1.85;color:rgba(13,13,13,.75)}

  .lv3 .cta{position:relative;padding:clamp(84px,11vw,140px) 24px;overflow:hidden}
  .lv3 .cta .bg{position:absolute;inset:0;background:url('/brand/imagery/07-broto-escuro.jpg') center/cover;filter:brightness(.24) sepia(.32) saturate(1.2)}
  .lv3 .cta .ov{position:absolute;inset:0;background:rgba(8,8,8,.6)}
  .lv3 .cta .in{position:relative;text-align:center;max-width:560px;margin:0 auto}
  .lv3 .cta .rule{width:34px;height:1px;background:#C8B89A;margin:0 auto 28px}
  .lv3 .cta h2{font-family:'Playfair Display',serif;font-weight:400;font-size:clamp(1.9rem,4vw,3rem);color:#fff;line-height:1.12;letter-spacing:-.4px}
  .lv3 .cta p{font-size:15px;color:rgba(255,255,255,.6);line-height:1.75;margin:16px 0 34px}
`

function Eyebrow({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="eyebrow"><span className="dot" style={{ background: color }} />{children}</span>
  )
}

function ShotNav() {
  return (
    <div className="shot-nav">
      <img src="/brand/logo/arvo-symbol-black.svg" width="15" height="15" alt="" />
      <span>arvo</span>
      <div className="av">LS</div>
    </div>
  )
}

// Animated laptop dashboard (hero, desktop only)
function LaptopMock({ l }: { l: Record<string, string> }) {
  const cntRef = useRef<HTMLSpanElement>(null)
  const donutRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const el = cntRef.current
    if (el) {
      const T = 152480, D = 1800, t0 = performance.now()
      let raf = 0
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / D)
        const e = 1 - Math.pow(1 - p, 3)
        el.textContent = Math.round(T * e).toLocaleString('pt-BR')
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(() => {
    const id = setTimeout(() => {
      const C = 2 * Math.PI * 26
      const segs: Array<[string, number, number]> = [['s1', .34, 0], ['s2', .18, .34], ['s3', .22, .52], ['s4', .14, .74], ['s5', .12, .88]]
      segs.forEach(([c, f, o]) => {
        const el = donutRef.current?.querySelector<SVGCircleElement>('.' + c)
        if (el) { el.style.strokeDasharray = `${C * f - 2} ${C - (C * f - 2)}`; el.style.strokeDashoffset = String(-(C * o)) }
      })
    }, 600)
    return () => clearTimeout(id)
  }, [])

  return (
    <div className="laptop">
      <div className="lp-in">
        <div className="lp-head">
          <img src="/brand/logo/arvo-symbol-black.svg" alt="" /><span className="wm">arvo</span>
          <span className="lp-div" /><span className="lp-cap">Capital</span>
          <div className="tabs"><i className="on">{l.a1l}</i><i>Finanças</i><i>{l.a2l}</i><i>{l.a5l}</i></div>
          <div className="av" style={{ width: 20, height: 20, fontSize: 7, marginLeft: 8 }}>LS</div>
        </div>
        <div className="lp-subnav"><i className="on">Dashboard</i><i>Performance</i><i>{l.mkPassive}</i><i>Aportes</i><i>Balanço</i></div>
        <div className="lp-toolbar">
          <span className="lp-cap" style={{ letterSpacing: '.22em' }}>Dashboard</span>
          <div className="lp-seg"><i>Mês</i><i>30D</i><i>12M</i><i className="on">YTD</i><i>Início</i></div>
        </div>
        <div className="lp-total">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p className="lb">{l.mkTotal}</p>
              <p className="v">€ <span ref={cntRef}>0</span></p>
            </div>
            <p style={{ fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(13,13,13,.55)', textAlign: 'right', margin: 0 }}>{l.mkUpdatedAt}<br />1 EUR = R$ 5,95</p>
          </div>
          <div className="lp-kpis">
            <div><p>{l.mkInvestedLbl}</p><p className="k">€ 128.000</p></div>
            <div><p>{l.mkResultLbl}</p><p className="k up">+€ 24.480 (+19,1%)</p></div>
            <div><p>{l.mkThisMonth}</p><p className="k up">+1,2%</p></div>
            <div><p>YTD 2026</p><p className="k up">+7,4%</p></div>
          </div>
          <div className="lp-indices">
            <div><p>Ibovespa</p><p className="k">130.450</p><p className="d up">+1,2%</p></div>
            <div><p>CDI</p><p className="k">10,50%</p><p className="d up">+0,05%</p></div>
            <div><p>S&P 500</p><p className="k">5.210</p><p className="d up">+2,8%</p></div>
            <div><p>EUR/BRL</p><p className="k">5,95</p><p className="d dn">-0,4%</p></div>
          </div>
        </div>
        <div className="lp-card">
          <p className="lp-lb">{l.mkAllocClass}</p>
          <div className="alloc">
            <svg ref={donutRef} className="donut" width="76" height="76" viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
              <circle cx="32" cy="32" r="26" stroke="#EFECE6" />
              <circle className="seg s1" cx="32" cy="32" r="26" stroke="#1B4FD8" />
              <circle className="seg s2" cx="32" cy="32" r="26" stroke="#A36A52" />
              <circle className="seg s3" cx="32" cy="32" r="26" stroke="#C8B89A" />
              <circle className="seg s4" cx="32" cy="32" r="26" stroke="#0D0D0D" />
              <circle className="seg s5" cx="32" cy="32" r="26" stroke="#E8A020" />
            </svg>
            <div className="legend">
              <i><b style={{ background: '#1B4FD8' }} />{l.mkClAcoesBr} · 34% <em>€ 51.800</em></i>
              <i><b style={{ background: '#A36A52' }} />{l.mkClFiis} · 18% <em>€ 27.400</em></i>
              <i><b style={{ background: '#C8B89A' }} />{l.mkClRf} · 22% <em>€ 33.600</em></i>
              <i><b style={{ background: '#0D0D0D' }} />{l.mkClCripto} · 14% <em>€ 21.300</em></i>
              <i><b style={{ background: '#E8A020' }} />{l.mkClExterior} · 12% <em>€ 18.300</em></i>
              <i><b style={{ background: '#1F8A5B' }} />{l.mkClCaixa} · 0,4% <em>€ 580</em></i>
            </div>
          </div>
        </div>
        <div className="lp-card">
          <p className="lp-lb">{l.mkEvolution}</p>
          <svg width="100%" height="56" viewBox="0 0 800 56" preserveAspectRatio="none" style={{ display: 'block', marginTop: 8 }}>
            <defs><linearGradient id="lv3g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0D0D0D" stopOpacity=".08" /><stop offset="100%" stopColor="#0D0D0D" stopOpacity="0" /></linearGradient></defs>
            <line x1="0" y1="19" x2="800" y2="19" stroke="#f0efec" strokeWidth="1" />
            <line x1="0" y1="38" x2="800" y2="38" stroke="#f0efec" strokeWidth="1" />
            <path d="M0 50 C 70 48 130 45 200 39 C 300 31 380 28 480 21 C 580 14 700 8 800 4 L 800 56 L 0 56 Z" fill="url(#lv3g1)" />
            <path className="draw" style={{ '--len': '860px' } as React.CSSProperties} d="M0 50 C 70 48 130 45 200 39 C 300 31 380 28 480 21 C 580 14 700 8 800 4" fill="none" stroke="#0D0D0D" strokeWidth="2" />
          </svg>
          <div className="lp-months">{['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].map(m => <i key={m}>{m}</i>)}</div>
        </div>
        <div className="lp-card lp-table" style={{ flex: 1 }}>
          <div className="tr th"><span>{l.mkColAsset}</span><span>{l.mkColClass}</span><span>{l.mkColValue}</span><span>{l.mkColReturn}</span></div>
          <div className="tr"><span>BOVA11</span><span>{l.mkClEtf}</span><span>R$ 45,2k</span><span className="up">+5,8%</span></div>
          <div className="tr"><span>WEGE3</span><span>{l.mkClAcao}</span><span>R$ 38,7k</span><span className="up">+12,4%</span></div>
          <div className="tr"><span>BTC</span><span>{l.mkClCripto}</span><span>R$ 28,4k</span><span className="dn">-2,1%</span></div>
          <div className="tr"><span>KNRI11</span><span>{l.mkClFii}</span><span>R$ 21,3k</span><span className="up">+3,2%</span></div>
          <div className="tr"><span>IVV</span><span>{l.mkClEtfEua}</span><span>R$ 18,9k</span><span className="up">+7,6%</span></div>
          <div className="tr"><span>TESOURO+</span><span>{l.mkClRf}</span><span>R$ 52,0k</span><span className="up">+1,1%</span></div>
        </div>
      </div>
    </div>
  )
}

// Phone with 3 cycling screens (hero)
function PhoneMock({ l }: { l: Record<string, string> }) {
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIdx(i => (i + 1) % 3)
        setVisible(true)
      }, 380)
    }, 3600)
    return () => clearInterval(id)
  }, [])
  const cls = (i: number) => `ph-s${i === idx && visible ? ' on' : ''}`
  return (
    <div className="phone">
      <div className="ph-island" />
      <div className="ph-nav"><img src="/brand/logo/arvo-symbol-black.svg" alt="" /><span>arvo</span><div className="av">LS</div></div>
      <div className="ph-screens">
        <div className={cls(0)}>
          <p className="ph-tag" style={{ color: '#8C6A28' }}>{l.mkTotal}</p>
          <p className="ph-title" style={{ fontSize: 22 }}>€ 152.480</p>
          <div className="ph-card">
            <div className="ph-kpis">
              <div><p>{l.mkInvestedLbl}</p><p className="k">€ 128k</p></div>
              <div><p>{l.mkResultLbl}</p><p className="k up">+19,1%</p></div>
              <div><p>{l.mkThisMonth}</p><p className="k up">+1,2%</p></div>
              <div><p>YTD 2026</p><p className="k up">+7,4%</p></div>
            </div>
          </div>
          <div className="ph-card" style={{ padding: '6px 12px' }}>
            <div className="ph-r"><span>BOVA11</span><span className="up">+5,8%</span></div>
            <div className="ph-r"><span>WEGE3</span><span className="up">+12,4%</span></div>
            <div className="ph-r"><span>BTC</span><span className="dn">-2,1%</span></div>
            <div className="ph-r"><span>KNRI11</span><span className="up">+3,2%</span></div>
            <div className="ph-r" style={{ border: 'none' }}><span>TESOURO+</span><span className="up">+1,1%</span></div>
          </div>
          <div className="ph-card">
            <p className="mlb">{l.mkBrEu}</p>
            <div className="pbar"><i style={{ '--w': '62%', background: GOLD } as React.CSSProperties} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(13,13,13,.55)', marginTop: 4 }}><span>R$ 412k</span><span>€ 84k</span></div>
          </div>
        </div>
        <div className={cls(1)}>
          <p className="ph-tag">{l.mkTrip}</p>
          <p className="ph-title">{l.mkTripName}</p>
          <div className="ph-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><p className="mlb">{l.mkBudget}</p><p style={{ fontSize: 10, color: '#D63B2F', fontWeight: 600, margin: 0 }}>70%</p></div>
            <p style={{ fontSize: 15, color: DARK, marginTop: 2 }}>€ 1.680 <span style={{ fontSize: 9.5, color: 'rgba(13,13,13,.55)' }}>{l.mkOf} € 2.400</span></p>
            <div className="pbar"><i style={{ '--w': '70%', background: '#D63B2F' } as React.CSSProperties} /></div>
          </div>
          <div className="ph-card" style={{ padding: '6px 12px' }}>
            <div className="ph-r"><span>{l.mkFlights}</span><span>€ 620</span></div>
            <div className="ph-r"><span>{l.mkStay}</span><span>€ 540</span></div>
            <div className="ph-r"><span>{l.mkFood}</span><span>€ 320</span></div>
            <div className="ph-r" style={{ border: 'none' }}><span>{l.mkTours}</span><span>€ 200</span></div>
          </div>
          <div className="ph-card" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex' }}><div className="av" style={{ width: 22, height: 22, fontSize: 7.5 }}>LS</div><div className="av lt" style={{ width: 22, height: 22, fontSize: 7.5, marginLeft: -8 }}>CM</div><div className="av lt" style={{ width: 22, height: 22, fontSize: 7.5, marginLeft: -8 }}>RP</div></div>
            <p style={{ fontSize: 10, color: 'rgba(13,13,13,.55)', margin: 0 }}>{l.mkSplit3}</p>
          </div>
        </div>
        <div className={cls(2)}>
          <p className="ph-tag">{l.mkCommunity}</p>
          <p className="ph-title">{l.mkConversations}</p>
          {[
            { ini: 'MB', name: 'Marina', tKey: 'mkP1', tag: 'mkTag1', time: '2h' },
            { ini: 'RS', name: 'Rafael', tKey: 'mkP2', tag: 'mkTag2', time: '4h' },
            { ini: 'JT', name: 'Júlia', tKey: 'mkP3', tag: 'mkTag3', time: '6h' },
          ].map(post => (
            <div className="ph-card" key={post.ini}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div className="av" style={{ width: 20, height: 20, fontSize: 7 }}>{post.ini}</div>
                <p style={{ fontSize: 10.5, fontWeight: 600, margin: 0 }}>{post.name}</p>
                <span style={{ fontSize: 8.5, color: 'rgba(13,13,13,.55)' }}>· {post.time}</span>
                <span className="ph-pill">{l[post.tag]}</span>
              </div>
              <p style={{ fontSize: 10.5, fontWeight: 600, marginTop: 6, lineHeight: 1.4 }}>{l[post.tKey]}</p>
            </div>
          ))}
          <div className="ph-card" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="av" style={{ width: 20, height: 20, fontSize: 7 }}>LC</div>
            <span className="typing"><i /><i /><i /></span>
            <p style={{ fontSize: 9.5, color: 'rgba(13,13,13,.55)', margin: 0 }}>{l.mkWriting}</p>
          </div>
        </div>
      </div>
      <div className="ph-dots">{[0, 1, 2].map(i => <i key={i} className={i === idx ? 'on' : ''} />)}</div>
    </div>
  )
}

export default function LandingPage() {
  const { signIn, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const l = (t as unknown as Record<string, Record<string, string>>).landing ?? {}

  const [menuOpen, setMenuOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginErr, setLoginErr] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginResending, setLoginResending] = useState(false)
  const [loginResent, setLoginResent] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [mobileLoginOpen, setMobileLoginOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [liveStep, setLiveStep] = useState(0)

  const loginRef = useRef<HTMLDivElement>(null)
  const stepsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loginOpen) return
    function onDown(e: MouseEvent) {
      if (loginRef.current && !loginRef.current.contains(e.target as Node)) setLoginOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [loginOpen])

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 64) }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // section reveals
  useEffect(() => {
    const io = new IntersectionObserver(
      es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('on') }),
      { threshold: 0.12 }
    )
    document.querySelectorAll('.lv3 .rv').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  // "como funciona" stepper: starts cycling once visible
  useEffect(() => {
    const el = stepsRef.current
    if (!el) return
    let interval: ReturnType<typeof setInterval> | null = null
    const io = new IntersectionObserver(es => {
      if (es[0].isIntersecting && !interval) {
        interval = setInterval(() => setLiveStep(s => (s + 1) % 3), 2600)
      }
    }, { threshold: 0.4 })
    io.observe(el)
    return () => { io.disconnect(); if (interval) clearInterval(interval) }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginErr('')
    setLoginResent(false)
    setLoginLoading(true)
    try {
      await signIn(loginEmail, loginPass)
      navigate('/dashboard')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (/email not confirmed/i.test(msg)) setLoginErr(t.login.errEmailNotConfirmed)
      else if (/invalid login credentials/i.test(msg)) setLoginErr(t.login.errInvalidCredentials)
      else if (/too many requests|rate limit/i.test(msg)) setLoginErr(t.login.errTooManyRequests)
      else setLoginErr(msg || 'Erro desconhecido')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleGoogle() {
    if (googleLoading) return
    setLoginErr('')
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setLoginErr(err instanceof Error ? err.message : 'Erro desconhecido')
      setGoogleLoading(false)
    }
  }

  async function handleResendFromOverlay() {
    if (!loginEmail || loginResending || loginResent) return
    setLoginResending(true)
    await supabase.auth.resend({ type: 'signup', email: loginEmail })
    setLoginResending(false)
    setLoginResent(true)
  }

  const headerOpaque = scrolled || menuOpen
  const BORDER = 'rgba(13,13,13,0.09)'
  const F_SANS = "'DM Sans', system-ui, sans-serif"

  // Shared between the desktop header dropdown and the mobile drawer's mini login form
  const googleLoginBlock = (
    <>
      <button type="button" onClick={handleGoogle} disabled={googleLoading}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', fontFamily: F_SANS, fontSize: 12, color: DARK, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 999, cursor: googleLoading ? 'not-allowed' : 'pointer', opacity: googleLoading ? 0.6 : 1 }}>
        <GoogleLogo size={14} />
        {t.login.continueWithGoogle}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 1, background: BORDER }} />
        <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(13,13,13,.4)' }}>{t.login.orDivider}</span>
        <div style={{ flex: 1, height: 1, background: BORDER }} />
      </div>
    </>
  )

  const NAV = [
    ['#produto', l.navConcept],
    ['#comunidade', l.navCommunity],
    ['#como-funciona', l.navHow],
    ['#faq', l.navFaq],
  ] as Array<[string, string]>

  const stepIcons = [
    <svg key="u" fill="none" viewBox="0 0 24 24" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    <svg key="p" fill="none" viewBox="0 0 24 24" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>,
    <svg key="g" fill="none" viewBox="0 0 24 24" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>,
  ]

  return (
    <div className="lv3">
      <style>{CSS}</style>

      {/* ── HEADER ── */}
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 60, background: headerOpaque ? 'rgba(250,248,244,0.9)' : 'transparent', backdropFilter: headerOpaque ? 'blur(14px)' : 'none', borderBottom: `1px solid ${headerOpaque ? BORDER : 'transparent'}`, paddingTop: 'env(safe-area-inset-top, 0px)', transition: 'background .4s, backdrop-filter .4s, border-color .4s' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="#hero" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <img src={headerOpaque ? '/brand/logo/arvo-symbol-black.svg' : '/brand/logo/arvo-symbol-gold.svg'} width="20" height="20" alt="" />
            <span style={{ fontFamily: "'Tenor Sans', serif", fontSize: 15, letterSpacing: '0.30em', textIndent: '0.30em', color: headerOpaque ? DARK : '#fff', lineHeight: 1, transition: 'color .4s' }}>arvo</span>
          </a>

          <nav className="hidden lg:flex" style={{ gap: 28 }}>
            {NAV.map(([href, label]) => (
              <a key={href} href={href} style={{ fontSize: 11.5, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap', color: headerOpaque ? 'rgba(13,13,13,.55)' : 'rgba(255,255,255,.7)', transition: 'color .3s' }}
                onMouseEnter={e => (e.currentTarget.style.color = headerOpaque ? DARK : '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = headerOpaque ? 'rgba(13,13,13,.55)' : 'rgba(255,255,255,.7)')}
              >{label}</a>
            ))}
          </nav>

          <div style={{ flex: 1 }} />

          <div className="hidden lg:flex" style={{ alignItems: 'center', gap: 22 }}>
            <div className={headerOpaque ? '' : 'dark'}><LanguageSelector /></div>
            <div style={{ width: 1, height: 14, background: headerOpaque ? BORDER : 'rgba(255,255,255,0.20)' }} />
            <div ref={loginRef} style={{ position: 'relative' }}>
              <button onClick={() => { setLoginOpen(o => !o); setLoginErr('') }}
                style={{ fontSize: 12.5, whiteSpace: 'nowrap', color: headerOpaque ? 'rgba(13,13,13,.75)' : 'rgba(255,255,255,.85)', background: 'none', border: 'none', borderBottom: `1px solid ${headerOpaque ? 'rgba(13,13,13,.25)' : 'rgba(255,255,255,.3)'}`, cursor: 'pointer', padding: '0 0 2px', fontFamily: F_SANS, transition: 'color .4s' }}>
                {l.enterBtn}
              </button>
              {loginOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 12px)', right: 0, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.10)', padding: '24px 22px', width: 288, zIndex: 10 }}>
                  <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: DARK, marginBottom: 18 }}>{l.loginTitle}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
                    {googleLoginBlock}
                  </div>
                  <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <input type="email" required autoFocus placeholder="E-mail" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                      style={{ fontFamily: F_SANS, fontSize: 13, padding: '10px 12px', border: `1px solid ${BORDER}`, borderRadius: 4, outline: 'none', color: DARK, background: '#fff', width: '100%', boxSizing: 'border-box' }} />
                    <input type="password" required placeholder="Senha" value={loginPass} onChange={e => setLoginPass(e.target.value)}
                      style={{ fontFamily: F_SANS, fontSize: 13, padding: '10px 12px', border: `1px solid ${BORDER}`, borderRadius: 4, outline: 'none', color: DARK, background: '#fff', width: '100%', boxSizing: 'border-box' }} />
                    {loginErr && (
                      <div style={{ fontSize: 12, color: 'var(--arvo-red)' }}>
                        <p style={{ margin: 0 }}>{loginErr}</p>
                        {loginErr === t.login.errEmailNotConfirmed && (
                          <div style={{ marginTop: 8 }}>
                            {loginResent ? (
                              <p style={{ margin: 0, fontSize: 11, color: 'var(--arvo-green)' }}>{t.login.emailResent ?? 'E-mail reenviado.'}</p>
                            ) : (
                              <button type="button" onClick={handleResendFromOverlay} disabled={loginResending || !loginEmail}
                                style={{ background: 'none', border: '1px solid var(--arvo-red)', borderRadius: 3, padding: '4px 10px', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--arvo-red)', cursor: loginResending || !loginEmail ? 'not-allowed' : 'pointer', opacity: loginResending || !loginEmail ? 0.6 : 1 }}>
                                {loginResending ? '...' : (t.login.resendEmail ?? 'Reenviar e-mail')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <button type="submit" disabled={loginLoading}
                      style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', background: DARK, color: '#fff', border: 'none', borderRadius: 999, padding: '11px 0', cursor: 'pointer', opacity: loginLoading ? 0.6 : 1, marginTop: 4 }}>
                      {loginLoading ? '...' : l.enterBtn}
                    </button>
                  </form>
                  <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Link to="/login?mode=forgot" onClick={() => setLoginOpen(false)}
                      style={{ fontSize: 11, letterSpacing: '0.08em', color: 'rgba(13,13,13,.55)' }}>{l.forgotPwd}</Link>
                    <Link to="/login?mode=register" onClick={() => setLoginOpen(false)}
                      style={{ fontSize: 11, letterSpacing: '0.08em', color: DARK }}>{l.createAccount}</Link>
                  </div>
                </div>
              )}
            </div>
            <Link to="/login?mode=register"
              style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap', padding: '10px 24px', borderRadius: 999, background: headerOpaque ? DARK : 'transparent', color: headerOpaque ? '#fff' : GOLD, border: headerOpaque ? '1px solid transparent' : '1px solid rgba(200,184,154,0.55)', transition: 'all .4s' }}>
              {l.createBtn}
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button className="lg:hidden" onClick={() => setMenuOpen(o => !o)} aria-label="Menu"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: headerOpaque ? DARK : '#fff', padding: 8, lineHeight: 0, marginRight: -8, transition: 'color .3s' }}>
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />}
            </svg>
          </button>
        </div>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="lg:hidden" style={{ background: 'rgba(255,255,255,0.98)', borderTop: `1px solid ${BORDER}`, padding: '8px 24px 20px' }}>
            {NAV.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}
                style={{ display: 'flex', alignItems: 'center', padding: '15px 0', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(13,13,13,.55)', borderBottom: `1px solid ${BORDER}` }}>
                {label}
              </a>
            ))}
            <div style={{ padding: '12px 0', borderBottom: `1px solid ${BORDER}` }}>
              <LanguageSelector />
            </div>
            {!mobileLoginOpen ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
                <Link to="/login?mode=register" onClick={() => setMenuOpen(false)}
                  style={{ textAlign: 'center', padding: '14px 0', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', background: DARK, color: '#fff', borderRadius: 999 }}>
                  {l.createAccount}
                </Link>
                <button onClick={() => { setMobileLoginOpen(true); setLoginErr('') }}
                  style={{ textAlign: 'center', padding: '10px 0', fontFamily: F_SANS, fontSize: 12, color: 'rgba(13,13,13,.55)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 4 }}>
                  {l.heroAlready} · {l.enterBtn}
                </button>
              </div>
            ) : (
              <form onSubmit={async e => { await handleLogin(e); if (!loginErr) setMenuOpen(false) }}
                style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {googleLoginBlock}
                <input type="email" required autoFocus placeholder="E-mail" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                  style={{ fontFamily: F_SANS, fontSize: 13, padding: '11px 12px', border: `1px solid ${BORDER}`, borderRadius: 4, color: DARK, background: '#fff', boxSizing: 'border-box' as const }} />
                <input type="password" required placeholder="Senha" value={loginPass} onChange={e => setLoginPass(e.target.value)}
                  style={{ fontFamily: F_SANS, fontSize: 13, padding: '11px 12px', border: `1px solid ${BORDER}`, borderRadius: 4, color: DARK, background: '#fff', boxSizing: 'border-box' as const }} />
                {loginErr && <p style={{ fontSize: 12, color: 'var(--arvo-red)', margin: 0 }}>{loginErr}</p>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => setMobileLoginOpen(false)}
                    style={{ flex: 1, padding: '12px 0', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 999, cursor: 'pointer', color: 'rgba(13,13,13,.55)' }}>
                    ←
                  </button>
                  <button type="submit" disabled={loginLoading}
                    style={{ flex: 2, padding: '12px 0', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', background: DARK, color: '#fff', border: 'none', borderRadius: 999, cursor: 'pointer', opacity: loginLoading ? 0.6 : 1 }}>
                    {loginLoading ? '...' : l.enterBtn}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="hero" id="hero">
        <div className="hero-bg" />
        <div className="hero-fade" />
        <div className="hero-fade2" />
        <div className="arvo-grain" />

        <div className="hero-mocks">
          <LaptopMock l={l} />
          <PhoneMock l={l} />
        </div>

        <div className="hero-grid">
          <div className="hero-copy">
            <span className="hero-eb"><span className="dot" />{l.eyebrow}</span>
            <h1>{l.h1a}<br /><em>{l.h1b}</em></h1>
            <p className="sub">{l.heroSub}</p>
            <div className="hero-ctas">
              <Link className="btn-gold" to="/login?mode=register">{l.heroCta}</Link>
              <Link className="lnk" to="/login">{l.heroAlready} →</Link>
            </div>
            <p className="assure">{l.assurance}</p>
          </div>
        </div>
      </section>

      {/* ── TRUST ── */}
      <div className="trust">
        <div className="trust-in">
          <span><b>{l.t1a}</b> {l.t1b}</span>
          <span><b>{l.t2a}</b> {l.t2b}</span>
          <span>{l.t3a} <b>{l.t3b}</b></span>
          <span>{l.t4a} <b>{l.t4b}</b></span>
        </div>
      </div>

      {/* ── LOGOS MARQUEE ── */}
      <section className="logos">
        <p className="cap">{l.logosCap}</p>
        <div className="marq">
          <div className="marq-track">
            {[0, 1].map(rep => INSTITUTIONS.map(n => (
              <span key={`${rep}-${n}`} style={{ display: 'contents' }}>
                <span className="wm2">{n}</span><span className="wm-dot" />
              </span>
            )))}
          </div>
        </div>
      </section>

      {/* ── ACTS ── */}
      <section className="acts" id="produto">
        <div className="wrap">
          <div className="acts-head rv">
            <Eyebrow color={GOLD}>{l.actsEyebrow}</Eyebrow>
            <h2>{l.actsH2}</h2>
          </div>
        </div>

        {/* Ato 1: Patrimônio */}
        <div className="wrap">
          <div className="act rv">
            <div>
              <Eyebrow color="#1B4FD8">{l.a1l}</Eyebrow>
              <h3>{l.a1t}</h3>
              <p className="desc">{l.a1d}</p>
              <ul><li>{l.a1b1}</li><li>{l.a1b2}</li><li>{l.a1b3}</li></ul>
            </div>
            <div className="vis">
              <div className="stage"><div className="shot">
                <ShotNav />
                <div className="shot-body">
                  <div className="mcard" style={{ borderColor: 'rgba(200,184,154,.4)' }}>
                    <p className="mlb" style={{ color: '#8C6A28' }}>{l.mkTotal}</p>
                    <p className="mval">€ 152.480</p>
                    <p style={{ fontSize: 11, color: '#1F8A5B', marginTop: 2 }}>↑ +19,1%</p>
                  </div>
                  <div className="mcard">
                    <p className="mlb">{l.mkAllocClass}</p>
                    <div className="fillbar"><i style={{ '--w': '34%', background: '#1B4FD8' } as React.CSSProperties} /></div>
                    <div className="fillbar"><i style={{ '--w': '22%', background: GOLD, transitionDelay: '.5s' } as React.CSSProperties} /></div>
                    <div className="fillbar"><i style={{ '--w': '14%', background: '#5A5248', transitionDelay: '.7s' } as React.CSSProperties} /></div>
                  </div>
                  <div className="mcard" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><p className="mlb">{l.mkFreedom}</p><p className="mval" style={{ fontSize: 15 }}>2041</p></div>
                    <p style={{ fontSize: 11, color: '#1B4FD8', margin: 0 }}>{l.mkFreedomPath}</p>
                  </div>
                </div>
              </div></div>
            </div>
          </div>
        </div>

        {/* Ato 2: Vida & Viagens (beige band, flip) */}
        <div className="band beige">
          <div className="wrap">
            <div className="act flip rv">
              <div>
                <Eyebrow color="#D63B2F">{l.a2l}</Eyebrow>
                <h3>{l.a2t}</h3>
                <p className="desc">{l.a2d}</p>
                <ul><li>{l.a2b1}</li><li>{l.a2b2}</li><li>{l.a2b3}</li></ul>
              </div>
              <div className="vis">
                <div className="stage"><div className="shot">
                  <ShotNav />
                  <div className="shot-body">
                    <div className="mcard">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><p className="mlb">{l.mkTripName}</p><p style={{ fontSize: 11, color: '#D63B2F', fontWeight: 600, margin: 0 }}>70%</p></div>
                      <p className="mval" style={{ fontSize: 16 }}>€ 1.680 <span style={{ fontSize: 10, color: 'rgba(13,13,13,.55)' }}>{l.mkOf} € 2.400</span></p>
                      <div className="fillbar"><i style={{ '--w': '70%', background: '#D63B2F' } as React.CSSProperties} /></div>
                    </div>
                    <div className="mcard">
                      <p className="mlb">{l.mkHome}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11.5, color: 'rgba(13,13,13,.75)' }}><span>Lucas · € 1.120</span><span>Camille · € 890</span></div>
                      <div className="fillbar"><i style={{ '--w': '56%', background: 'rgba(214,59,47,.7)', transitionDelay: '.4s' } as React.CSSProperties} /></div>
                    </div>
                    <div className="mcard" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div style={{ display: 'flex' }}><div className="av">LS</div><div className="av lt" style={{ marginLeft: -9 }}>CM</div></div>
                      <p style={{ fontSize: 11, color: 'rgba(13,13,13,.55)', margin: 0 }}>{l.mkAutoSplit}</p>
                    </div>
                  </div>
                </div></div>
              </div>
            </div>
          </div>
        </div>

        {/* Ato 3: Roteiros */}
        <div className="wrap">
          <div className="act rv">
            <div>
              <Eyebrow color="#D63B2F">{l.a3l}</Eyebrow>
              <h3>{l.a3t}</h3>
              <p className="desc">{l.a3d}</p>
              <ul><li>{l.a3b1}</li><li>{l.a3b2}</li><li>{l.a3b3}</li></ul>
            </div>
            <div className="vis">
              <div className="stage"><div className="shot">
                <ShotNav />
                <div className="shot-body">
                  <div className="day-chips">
                    <i>{l.mkAll}</i><i className="c1 on">{l.mkDay} 1</i><i className="c2">{l.mkDay} 2</i><i className="c3">{l.mkDay} 3</i>
                  </div>
                  <div className="mcard trip-map">
                    <svg width="100%" height="100%" viewBox="0 0 320 148" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
                      <rect width="320" height="148" fill="#EDEAE3" />
                      <path d="M-10 118 C 60 96 130 128 200 108 S 330 96 340 100 L 340 160 L -10 160 Z" fill="#C9D6DB" />
                      <path d="M0 30 H320 M0 62 H320 M0 94 H320" stroke="#fff" strokeWidth="5" />
                      <path d="M52 0 V148 M126 0 V148 M206 0 V148 M272 0 V148" stroke="#fff" strokeWidth="4" />
                      <path d="M-10 12 L330 84" stroke="#fff" strokeWidth="7" />
                      <path d="M-10 12 L330 84" stroke="#F6D9A0" strokeWidth="3" />
                    </svg>
                    <div className="pin p1" style={{ left: '18%', top: '52%' }}><span>1</span></div>
                    <div className="pin p1" style={{ left: '44%', top: '24%' }}><span>1</span></div>
                    <div className="pin p2" style={{ left: '66%', top: '56%' }}><span>2</span></div>
                    <div className="pin p3" style={{ left: '84%', top: '30%' }}><span>3</span></div>
                  </div>
                  <div className="mcard" style={{ padding: '8px 12px' }}>
                    <div className="it-row"><span className="day-badge" style={{ background: '#D63B2F' }}>1</span><div className="it-mid"><p className="it-name">Torre de Belém</p><p className="it-sub">{l.mkMonument} · € 8</p></div><span className="it-open">↗</span></div>
                    <div className="it-row"><span className="day-badge" style={{ background: '#D63B2F' }}>1</span><div className="it-mid"><p className="it-name">Time Out Market</p><p className="it-sub">{l.mkRestaurant} · € 42</p></div><span className="it-open">↗</span></div>
                    <div className="it-row" style={{ border: 'none' }}><span className="day-badge" style={{ background: '#1B4FD8' }}>2</span><div className="it-mid"><p className="it-name">Alfama</p><p className="it-sub">{l.mkQuarter}</p></div><span className="it-open">↗</span></div>
                  </div>
                  <div className="mcard" style={{ display: 'flex', alignItems: 'center', gap: 9, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div style={{ display: 'flex' }}><div className="av">LS</div><div className="av lt" style={{ marginLeft: -9 }}>CM</div></div>
                      <p style={{ fontSize: 10.5, color: 'rgba(13,13,13,.55)', margin: 0 }}>{l.mkSharedItin}</p>
                    </div>
                    <span style={{ fontSize: 9.5, color: '#D63B2F', whiteSpace: 'nowrap' }}>{l.mkOpenMaps} ↗</span>
                  </div>
                </div>
              </div></div>
            </div>
          </div>
        </div>

        {/* Ato 4: Entre amigos (beige band, flip) */}
        <div className="band beige">
          <div className="wrap">
            <div className="act flip rv">
              <div>
                <Eyebrow color="#D63B2F">{l.a4l}</Eyebrow>
                <h3>{l.a4t}</h3>
                <p className="desc">{l.a4d}</p>
                <ul><li>{l.a4b1}</li><li>{l.a4b2}</li><li>{l.a4b3}</li></ul>
              </div>
              <div className="vis">
                <div className="stage"><div className="shot">
                  <ShotNav />
                  <div className="shot-body">
                    <div className="mcard">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{ display: 'flex' }}><div className="av">LS</div><div className="av lt" style={{ marginLeft: -9 }}>CM</div><div className="av lt" style={{ marginLeft: -9 }}>RP</div></div>
                        <div>
                          <p className="mlb" style={{ letterSpacing: '.14em' }}>{l.mkGroupName}</p>
                          <p style={{ fontSize: 9.5, color: 'rgba(13,13,13,.55)', marginTop: 1 }}>{l.mkGroupMeta}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mcard" style={{ padding: '6px 12px' }}>
                      <div className="ph-r"><span>{l.mkExp1}<br /><i style={{ fontStyle: 'normal', fontSize: 8.5, color: 'rgba(13,13,13,.55)' }}>{l.mkPaidYou}</i></span><span>€ 96</span></div>
                      <div className="ph-r"><span>{l.mkExp2}<br /><i style={{ fontStyle: 'normal', fontSize: 8.5, color: 'rgba(13,13,13,.55)' }}>{l.mkPaidCam}</i></span><span>€ 27</span></div>
                      <div className="ph-r" style={{ border: 'none' }}><span>{l.mkExp3}<br /><i style={{ fontStyle: 'normal', fontSize: 8.5, color: 'rgba(13,13,13,.55)' }}>{l.mkPaidRaf}</i></span><span>€ 34</span></div>
                    </div>
                    <div className="mcard">
                      <p className="mlb">{l.mkBalances}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 11 }}><span style={{ color: 'rgba(13,13,13,.75)' }}>{l.mkOwesYou}</span><span className="up" style={{ fontWeight: 600 }}>€ 23</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11 }}><span style={{ color: 'rgba(13,13,13,.75)' }}>{l.mkYouOwe}</span><span className="dn" style={{ fontWeight: 600 }}>€ 17</span></div>
                    </div>
                    <div className="mcard" style={{ textAlign: 'center', background: DARK, borderColor: DARK }}>
                      <span style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: GOLD }}>{l.mkSettle}</span>
                    </div>
                  </div>
                </div></div>
              </div>
            </div>
          </div>
        </div>

        {/* Ato 5: Comunidade (white band) */}
        <div className="band white" id="comunidade">
          <div className="wrap">
            <div className="act rv">
              <div>
                <Eyebrow color="#E8A020">{l.a5l}</Eyebrow>
                <h3>{l.a5t}</h3>
                <p className="desc">{l.a5d}</p>
                <ul><li>{l.a5b1}</li><li>{l.a5b2}</li><li>{l.a5b3}</li></ul>
              </div>
              <div className="vis">
                <div className="stage" style={{ background: '#F1EDE5' }}><div className="shot">
                  <ShotNav />
                  <div className="shot-body">
                    {[
                      { ini: 'MB', name: 'Marina', tKey: 'mkP1', tag: 'mkTag1', time: '2h' },
                      { ini: 'RS', name: 'Rafael', tKey: 'mkP2', tag: 'mkTag2', time: '4h' },
                    ].map(post => (
                      <div className="mcard feedmsg" key={post.ini}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="av" style={{ width: 23, height: 23, fontSize: 8 }}>{post.ini}</div>
                          <p style={{ fontSize: 11.5, fontWeight: 600, margin: 0 }}>{post.name}</p>
                          <span style={{ fontSize: 9, color: 'rgba(13,13,13,.55)' }}>· {post.time}</span>
                          <span className="ph-pill" style={{ fontSize: 8, padding: '2px 8px' }}>{l[post.tag]}</span>
                        </div>
                        <p style={{ fontSize: 11.5, fontWeight: 600, marginTop: 7, lineHeight: 1.4 }}>{l[post.tKey]}</p>
                      </div>
                    ))}
                    <div className="mcard feedmsg" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div className="av" style={{ width: 23, height: 23, fontSize: 8 }}>LC</div>
                      <span className="typing"><i /><i /><i /></span>
                      <p style={{ fontSize: 10.5, color: 'rgba(13,13,13,.55)', margin: 0 }}>{l.mkWriting}</p>
                    </div>
                  </div>
                </div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── QUOTE ── */}
      <section className="quote">
        <div className="bg" />
        <div className="arvo-grain" />
        <div className="in rv">
          <div className="rule" />
          <p className="q">"{l.quoteText}"</p>
          <p className="a">{l.quoteAuthor}</p>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section className="how" id="como-funciona">
        <div className="wrap">
          <div className="rv">
            <Eyebrow color={GOLD}>{l.howEyebrow}</Eyebrow>
            <h2>{l.howH2v3}</h2>
          </div>
          <div className="steps rv" ref={stepsRef}>
            <div className="prog" style={{ width: `${(liveStep / 2) * 78}%` }} />
            {[
              { t: l.st1t, d: l.st1d },
              { t: l.st2t, d: l.st2d },
              { t: l.st3t, d: l.st3d },
            ].map((step, i) => (
              <div key={i} className={`step${liveStep === i ? ' live' : ''}`}>
                <div className="ball">{stepIcons[i]}</div>
                <h3>{step.t}</h3>
                <p>{step.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="faq" id="faq">
        <div className="rv">
          <Eyebrow color={GOLD}>{l.faqEyebrow}</Eyebrow>
          <h2>{l.faqH2v3}</h2>
        </div>
        <div className="list rv">
          {[
            { q: l.fq1, a: l.fa1 }, { q: l.fq2, a: l.fa2 }, { q: l.fq3, a: l.fa3 }, { q: l.fq4, a: l.fa4 },
          ].map((faq, i) => (
            <details key={i}>
              <summary>
                <span className="n">{String(i + 1).padStart(2, '0')}</span>{faq.q}
                <svg className="chev" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="rgba(13,13,13,0.5)" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </summary>
              <p className="ans">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta">
        <div className="bg" />
        <div className="ov" />
        <div className="arvo-grain" />
        <div className="in rv">
          <div className="rule" />
          <h2>{l.ctaA}<br />{l.ctaB}</h2>
          <p>{l.ctaSub}</p>
          <Link className="btn-gold" to="/login?mode=register">{l.heroCta}</Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: DARK, padding: '52px 24px 30px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 22, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/brand/logo/arvo-symbol-gold.svg" width="20" height="20" alt="" style={{ opacity: 0.55 }} />
              <span style={{ fontFamily: "'Tenor Sans', serif", fontSize: 16, letterSpacing: '0.30em', textIndent: '0.30em', color: '#fff', lineHeight: 1 }}>arvo</span>
            </div>
            <div style={{ display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link to="/privacy" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.32)' }}>{l.footerPrivacy}</Link>
              <Link to="/terms" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.32)' }}>{l.footerTerms}</Link>
              <Link to="/login" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.32)' }}>{l.footerEnter}</Link>
            </div>
          </div>
          <div style={{ paddingTop: 20, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14 }}>
            <span style={{ fontSize: 10, letterSpacing: '0.22em', color: 'rgba(200,184,154,0.32)' }}>{l.footerSlogan}</span>
            <span style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(200,184,154,0.32)' }}>© 2026 arvo</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
