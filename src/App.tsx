import React, { useEffect, useRef, useState } from 'react';
import { Callout, FileCard, Group, Paragraph } from './ui';
import { levels, type Level } from './levels';
import './style.css';

type Line = { kind: 'in' | 'out' | 'err'; text: string };
type Mode = { kind: 'exec' } | { kind: 'conf' } | { kind: 'if'; iface: string };

const fmt = (n: number) => (Math.round(n * 2) / 2).toString().replace(/\.5$/, '.5');

function Star({ fill, size = 16 }: { fill: number; size?: number }) {
    const id = `sg${Math.round(fill * 10)}`;
    return <svg width={size} height={size} viewBox="0 0 24 24" className="star" aria-hidden="true">
        <defs><linearGradient id={id}><stop offset={`${fill * 100}%`} stopColor="#ffc928" /><stop offset={`${fill * 100}%`} stopColor="rgba(255,201,40,0)" /></linearGradient></defs>
        <path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.5l-6 3.4 1.3-6.7-5-4.7 6.8-.8z" fill={`url(#${id})`} stroke="#ffc928" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>;
}

function Stars({ value, size }: { value: number; size?: number }) {
    return <span className="starrow" aria-label={`${fmt(value)} of 3 stars`}>{[0, 1, 2].map((i) => <Star key={i} size={size} fill={Math.max(0, Math.min(1, value - i))} />)}</span>;
}

const potential = (secs: number, count: number, hints: number, shown: boolean, level: Level) => {
    let s = 1;
    if (secs <= level.parTime) s++;
    if (count <= level.par) s++;
    return Math.max(0.5, s - hints * 0.5 - (shown ? 1 : 0));
};

function Topo({ level }: { level: Level }) {
    const { nodes, links } = level.topo;
    return <div className="topo" aria-label={`Topology: ${nodes.join(' to ')}`}>
        {nodes.map((n, i) => <React.Fragment key={n}>
            <div className="node">{n}</div>
            {i < nodes.length - 1 && <div className="link"><span>{links[i] ?? ''}</span></div>}
        </React.Fragment>)}
    </div>;
}

function Faceplate() {
    const groups = [0, 1, 2, 3];
    const bad = { g: 1, r: 1, c: 2 };
    return <svg className="face" viewBox="0 0 640 140" role="img" aria-label="Nexus-style 48-port switch with one port showing a fault">
        <defs>
            <linearGradient id="chas" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a4656" /><stop offset="1" stopColor="#1a222e" /></linearGradient>
            <linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#566274" /><stop offset="1" stopColor="#2c3644" /></linearGradient>
            <linearGradient id="side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#222b38" /><stop offset="1" stopColor="#0f1520" /></linearGradient>
            <pattern id="vent" width="4" height="3" patternUnits="userSpaceOnUse"><rect width="2" height="1.4" fill="#0a0f17" /></pattern>
        </defs>
        <polygon points="26,14 622,14 646,30 10,30" fill="url(#top)" stroke="#00c8e0" strokeOpacity=".35" />
        <rect x="40" y="19" width="560" height="6" fill="url(#vent)" />
        <polygon points="610,30 646,14 646,100 610,114" fill="url(#side)" stroke="#00c8e0" strokeOpacity=".3" />
        {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx="622" cy={44 + i * 10} r="1.6" fill="#00c8e0" opacity=".5" />)}
        <rect x="10" y="30" width="600" height="84" fill="url(#chas)" stroke="#00c8e0" strokeOpacity=".5" />
        {['BCN', 'STS', 'PSU'].map((t, i) => <g key={t}><circle cx="22" cy={46 + i * 14} r="2.4" fill={i === 1 ? '#3ddc84' : '#00c8e0'} /><text x="29" y={48.5 + i * 14} fontSize="5.5" fill="#8e9bb0" fontFamily="monospace">{t}</text></g>)}
        <text x="14" y="104" fontSize="6" fill="#00c8e0" fontFamily="monospace">NEXUS-STYLE 48P ACCESS SWITCH  SW1</text>
        {groups.map((g) => <g key={g}>
            <rect x={56 + g * 112} y="38" width="104" height="52" fill="#d9d0b8" opacity=".12" stroke="#00c8e0" strokeOpacity=".3" />
            {[0, 1].map((r) => Array.from({ length: 6 }, (_, c) => {
                const isBad = g === bad.g && r === bad.r && c === bad.c;
                const x = 60 + g * 112 + c * 16.5, y = 42 + r * 22;
                return <g key={`${r}${c}`}>
                    <rect x={x} y={y} width="13" height="12" fill="#02040a" stroke={isBad ? '#ff3b4e' : '#5b7083'} />
                    <rect x={x + 3} y={y + 7} width="7" height="2" fill="#1b2a38" />
                    <circle cx={x + 6.5} cy={y + 16.5} r="1.6" fill={isBad ? '#ff3b4e' : '#00c8e0'} className={isBad ? 'blink' : ''} />
                </g>;
            }))}
        </g>)}
        {[0, 1].map((r) => [0, 1].map((c) => <g key={`s${r}${c}`}><rect x={510 + c * 22} y={40 + r * 24} width="19" height="20" fill="#02040a" stroke="#7aa0b8" /><rect x={513 + c * 22} y={46 + r * 24} width="13" height="3" fill="#00c8e0" opacity=".5" /></g>))}
        <rect x="556" y="40" width="46" height="20" fill="#02040a" stroke="#7aa0b8" /><rect x="556" y="64" width="46" height="20" fill="#02040a" stroke="#7aa0b8" />
        <text x="559" y="96" fontSize="5" fill="#8e9bb0" fontFamily="monospace">QSFP 53-54</text>
        <text x="510" y="96" fontSize="5" fill="#8e9bb0" fontFamily="monospace">SFP 49-52</text>
    </svg>;
}

function Clock({ stop, secs, onTick }: { stop: boolean; secs: number; onTick: () => void }) {
    useEffect(() => {
        if (stop) return;
        const t = setInterval(onTick, 1000);
        return () => clearInterval(t);
    }, [stop]);
    return <span>Time {secs}s</span>;
}

const ANSWERS: Record<number, string> = {
    1: 'configure terminal\ninterface gi0/1\nduplex auto',
    2: 'configure terminal\ninterface fa0/2\nswitchport access vlan 10',
    3: 'configure terminal\ninterface gi0/24\nswitchport trunk allowed vlan add 20',
    4: 'configure terminal\nip route 192.168.20.0 255.255.255.0 10.0.0.2',
    5: 'configure terminal\ninterface fa0/3\nno shutdown',
    6: 'configure terminal\nservice unsupported-transceiver',
    7: 'configure terminal\ninterface fa0/12\nspeed auto',
    8: 'configure terminal\nboot system flash:c2960-lanbasek9-mz.150-2.SE.bin',
    9: 'configure terminal\ninterface gi0/2\nchannel-group 1 mode active',
    10: 'configure terminal\nno access-list 101 deny ip 192.168.10.0 0.0.0.255 any',
};

function Play({ level, onDone, onBack, onLive }: { level: Level; onDone: (s: number) => void; onBack: () => void; onLive: (s: number) => void }) {
    const dev = level.devices[0];
    const [lines, setLines] = useState<Line[]>([{ kind: 'out', text: `Connected to ${dev.name}. Type "?" for tips.` }]);
    const [mode, setMode] = useState<Mode>({ kind: 'exec' });
    const [fixed, setFixed] = useState(false);
    const [count, setCount] = useState(0);
    const [hints, setHints] = useState(0);
    const [shown, setShown] = useState(false);
        const [val, setVal] = useState('');
    const [result, setResult] = useState<number | null>(null);
    const end = useRef<HTMLDivElement>(null);
    const [secs, setSecs] = useState(0);
    const secsRef = useRef(0);
    secsRef.current = secs;
    const live = potential(secs, count, hints, shown, level);
    useEffect(() => { onLive(result !== null ? result : live); }, [live, result]);
    useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [lines]);

    const promptStr = mode.kind === 'exec' ? `${dev.prompt}#` : mode.kind === 'conf' ? `${dev.prompt}(config)#` : `${dev.prompt}(config-if)#`;

    function run(e?: { preventDefault: () => void }) {
        e?.preventDefault();
        if (result !== null) return;
        const raw = val.trim();
        setVal('');
        if (!raw) return;
        const cmd = raw.toLowerCase().replace(/\s+/g, ' ');
        const add: Line[] = [{ kind: 'in', text: `${promptStr} ${raw}` }];
        let counts = true;
        let nowFixed = fixed;
        if (cmd === '?') {
            counts = false;
            add.push({ kind: 'out', text: 'Tips: show ... (vlan brief, interfaces status, interface <name>, interfaces trunk, interfaces transceiver, interfaces counters errors, port-security, etherchannel summary, access-lists, environment, boot, flash, logging, ip route, running-config), ping, configure terminal, interface <name>, end.' });
        } else if (/^conf(ig(ure)?)?( t(erminal)?)?$/.test(cmd) || cmd === 'conf t') {
            setMode({ kind: 'conf' });
        } else if (/^(end|exit)$/.test(cmd) || cmd === 'ctrl-z') {
            setMode(cmd === 'exit' && mode.kind === 'if' ? { kind: 'conf' } : { kind: 'exec' });
        } else if (/^int(erface)? /.test(cmd) && mode.kind !== 'exec') {
            const iface = cmd.replace(/^int(erface)? /, '').replace(/\s+/g, '');
            setMode({ kind: 'if', iface });
        } else if (mode.kind !== 'exec') {
            const ctx = mode.kind === 'if' ? mode.iface : '';
            const fix = dev.fixes.find((f) => f.ctx.test(ctx) && f.re.test(cmd));
            if (fix) { nowFixed = true; setFixed(true); }
            else if (/^(duplex|switchport|ip route|ip access|access-list|channel-group|service|boot|errdisable|no |speed|description|shutdown)/.test(cmd)) {
                add.push({ kind: 'out', text: '(applied, but nothing looks better)' });
            } else add.push({ kind: 'err', text: '% Invalid input detected' });
        } else {
            const found = dev.cmds.find((c) => c.re.test(cmd));
            if (found) add.push({ kind: 'out', text: typeof found.out === 'function' ? found.out(fixed) : found.out });
            else { add.push({ kind: 'err', text: '% Invalid input detected' }); counts = false; }
        }
        const nc = count + (counts ? 1 : 0);
        setCount(nc);
        setLines((l) => [...l, ...add]);
        if (nowFixed && !fixed) {
            const s = potential(secsRef.current, nc, hints, shown, level);
            setResult(s);
            setLines((l) => [...l, { kind: 'out', text: '✔ Fault fixed. Link is healthy again.' }]);
        }
    }

    return <>
        <p className="meta"><button className="file-button is-compact" data-variant="secondary" onClick={onBack}>All levels</button></p>
        <section className="play"><h2 className="ph">{`Level ${level.id} of ${levels.length}`}</h2>
            <Paragraph>{level.story}</Paragraph>
            <Topo level={level} />
            <div className="stats"><Clock stop={result !== null} secs={secs} onTick={() => setSecs((x) => x + 1)} /><span>Commands {count}</span><span>Hints {hints}</span></div>
            <div className="term" role="log" aria-label="Terminal">
                {lines.map((l, i) => <pre key={i} className={l.kind}>{l.text}</pre>)}
                <div ref={end} />
            </div>
            {result === null && <div className="termform">
                <label htmlFor="cmd" className="pr">{promptStr}</label>
                <input id="cmd" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') run(e); }} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="type a command" />
                <button className="file-button" type="button" onClick={() => run()}>Run</button>
            </div>}
            {result === null && <div className="row"><button className="file-button is-compact" data-variant="secondary" disabled={hints >= level.hints.length} onClick={() => { setLines((l) => [...l, { kind: 'out', text: `Hint ${hints + 1}: ${level.hints[hints]}` }]); setHints(hints + 1); }}><Star fill={0.5} size={16} /> Hint (costs ½ star)</button><button className="file-button is-compact ans" data-variant="secondary" disabled={shown} onClick={() => { setLines((l) => [...l, { kind: 'out', text: `Answer:\n${ANSWERS[level.id]}` }]); setShown(true); }}><Star fill={1} size={16} /> Show Answer (costs 1 star)</button></div>}
            {result !== null && <>
                <Callout title={`Solved: ${fmt(result)} of 3 stars`} tone="neutral">{level.lesson} Par: {level.par} commands, {level.parTime}s. You: {count} commands, {secsRef.current}s{hints ? `, ${hints} hint${hints > 1 ? 's' : ''} (-${fmt(hints * 0.5)})` : ''}{shown ? ', answer shown' : ''}.</Callout>
                <div className="row"><button className="file-button" onClick={() => onDone(result)}>{level.id < levels.length ? 'Next level' : 'Finish'}</button></div>
            </>}
        </section>
    </>;
}

type Screen = 'home' | 'about' | 'levels' | 'play';

function load(): Record<number, number> {
    try { return JSON.parse(localStorage.getItem('netfix-best') ?? '{}'); } catch { return {}; }
}

export function App() {
    const [screen, setScreen] = useState<Screen>('home');
    const [cur, setCur] = useState<number>(0);
    const [best, setBest] = useState<Record<number, number>>(load);
    const [run, setRun] = useState(0);
    const [liveStars, setLiveStars] = useState(3);
    const total = Object.values(best).reduce((a, b) => a + b, 0);
    const unlocked = (id: number) => id === 1 || (best[id - 1] ?? 0) > 0;
    const start = (i: number) => { setRun((r) => r + 1); setCur(i); setScreen('play'); };
    const save = (b: Record<number, number>) => { setBest(b); try { localStorage.setItem('netfix-best', JSON.stringify(b)); } catch { /* storage unavailable */ } };
    return <FileCard>
        <div className="brand">NetFix <em>Lab</em></div>
        <nav className="nav">
            <button className={screen === 'home' ? 'on' : ''} onClick={() => setScreen('home')}>Home</button>
            <button className={screen === 'about' ? 'on' : ''} onClick={() => setScreen('about')}>About game</button>
            <button className={screen === 'levels' || screen === 'play' ? 'on' : ''} onClick={() => setScreen('levels')}>Levels</button>
            <div className="yourstars" aria-live="polite">
                <span className="lbl">Your stars</span>
                <strong>{fmt(total)}<small> / {levels.length * 3}</small></strong>
                {screen === 'play' && <span className="cur">This level <Stars value={liveStars} size={14} /> {fmt(liveStars)}</span>}
            </div>
        </nav>
        {screen === 'home' && <>
            <div className="hero">
                <span className="chip">■ NETWORK TROUBLESHOOTING</span>
                <h1 className="h1">Fix the Network.<br /><em>Find the Fault.</em></h1>
                <Faceplate />
            </div>
            <div className="rules">
                <h2>Game rules</h2>
                <ol>
                    <li>Each level is one broken network. Read the story and look at the topology.</li>
                    <li>Use show commands in the terminal to find the fault, then configure terminal and fix it.</li>
                    <li>Fixing the fault earns 1 star. Beat the par time for a second star. Stay within the par command count for the third.</li>
                    <li>A hint costs half a star. Show Answer costs one star. A fix always keeps at least half a star.</li>
                    <li>Level 1 is open. Each next level unlocks only when you clear the one before it.</li>
                </ol>
                <p className="tip">Tip: type ? in the terminal for the list of supported show commands.</p>
            </div>
            <div className="row cta"><button className="file-button" onClick={() => setScreen('levels')}>Let the troubleshooting begin</button></div>
        </>}
        {screen === 'about' && <div className="rules">
            <h2>About the game</h2>
            <p>NetFix Lab is a hands-on troubleshooting game for people learning networking and getting ready for CCNA.</p>
            <p>Every level drops you into a network with one fault: a duplex mismatch, wrong VLAN, bad trunk, missing route, err-disabled port, bad SFP, interface errors, boot problem, EtherChannel mismatch or a blocking ACL.</p>
            <p>You work in a simulated switch or router terminal the way an engineer would: look first with show commands, find the cause, then fix it with the right configuration. Fast, clean fixes earn more stars.</p>
            <p>The terminal output is simplified for learning and is not a full Cisco IOS simulator.</p>
            <div className="row cta"><button className="file-button" onClick={() => setScreen('levels')}>Let the troubleshooting begin</button></div>
        </div>}
        {screen === 'levels' && <Group label={`Stars ${fmt(total)} of ${levels.length * 3}`} heading>
            <div className="levels">
                {levels.map((l, i) => {
                    const open = unlocked(l.id);
                    return <button key={l.id} className={`lvl${open ? '' : ' locked'}`} disabled={!open} onClick={() => start(i)}>
                        <span className="n">{open ? l.id : '🔒'}</span>
                        <span className="t"><strong>{l.title}</strong><small>{open ? l.tag : `Clear level ${l.id - 1} to unlock`}</small></span>
                        <span className="s" aria-label={`${best[l.id] ?? 0} stars`}><Stars value={best[l.id] ?? 0} size={14} /></span>
                    </button>;
                })}
            </div>
        </Group>}
        {screen === 'play' && <Play key={run} onLive={setLiveStars} level={levels[cur]} onBack={() => setScreen('levels')} onDone={(s) => {
            save({ ...best, [levels[cur].id]: Math.max(best[levels[cur].id] ?? 0, s) });
            if (cur + 1 < levels.length) start(cur + 1); else setScreen('levels');
        }} />}
    </FileCard>;
}
