export type Out = string | ((fixed: boolean) => string);
export type Cmd = { re: RegExp; out: Out };
export type Fix = { ctx: RegExp; re: RegExp };
export type Device = { name: string; prompt: string; cmds: Cmd[]; fixes: Fix[] };
export type Level = {
    id: number; title: string; tag: string; story: string; par: number; parTime: number;
    topo: { nodes: string[]; links: string[] };
    devices: Device[]; hints: string[]; lesson: string;
};

const S = 'sh(o|ow)?';
export const levels: Level[] = [
    {
        id: 1, title: 'The slow server', tag: 'Duplex mismatch', par: 5, parTime: 90,
        story: 'The file server on SW1 port Gi0/1 crawls. Users say transfers start fast, then stall. Find the fault on SW1 and fix it.',
        topo: { nodes: ['PC-A', 'SW1', 'Server'], links: ['Fa0/5', 'Gi0/1'] },
        hints: ['Look at the interface the server is plugged into.', 'Late collisions and half-duplex on a switch port are a bad sign.', 'Enter interface Gi0/1, then set duplex full (or auto).'],
        lesson: 'A duplex mismatch causes late collisions and poor throughput. The server negotiated full duplex, but the port was hard-coded to half.',
        devices: [{
            name: 'SW1', prompt: 'SW1',
            cmds: [
                { re: new RegExp(`^${S} (ip )?int(erface)?s? (br(ief)?|status)$`), out: (f) => `Interface   Status      Vlan  Duplex  Speed\nFa0/5       connected   10    a-full  a-100\nGi0/1       connected   10    ${f ? 'a-full' : 'half  '}  1000` },
                { re: new RegExp(`^${S} int(erface)? (gi|gigabitethernet) ?0/1$`), out: (f) => f
                    ? 'GigabitEthernet0/1 is up, line protocol is up\n  Full-duplex, 1000Mb/s\n  0 late collision, 0 collisions' 
                    : 'GigabitEthernet0/1 is up, line protocol is up\n  Half-duplex, 1000Mb/s\n  4821 late collision, 9302 collisions' },
                { re: new RegExp(`^${S} vlan( br(ief)?)?$`), out: 'VLAN Name     Status   Ports\n10   USERS    active   Fa0/5, Gi0/1' },
                { re: new RegExp(`^${S} run(ning-config)?$`), out: (f) => `interface GigabitEthernet0/1\n switchport access vlan 10\n${f ? ' duplex auto' : ' duplex half'}\n!\ninterface FastEthernet0/5\n switchport access vlan 10` },
            ],
            fixes: [{ ctx: /^gi/, re: /^duplex (full|auto)$/ }],
        }],
    },
    {
        id: 2, title: 'Same VLAN, no reply', tag: 'Wrong VLAN', par: 5, parTime: 90,
        story: 'PC-A (VLAN 10) cannot ping PC-B, which should also be in VLAN 10. Both hang off SW1. Find which port is misplaced and fix it.',
        topo: { nodes: ['PC-A', 'SW1', 'PC-B'], links: ['Fa0/1', 'Fa0/2'] },
        hints: ['Check which VLAN each port belongs to.', 'Fa0/2 is not in VLAN 10.', 'Enter interface Fa0/2, then switchport access vlan 10.'],
        lesson: 'Hosts in the same subnet must share a VLAN. A port left in the wrong access VLAN silently isolates the host.',
        devices: [{
            name: 'SW1', prompt: 'SW1',
            cmds: [
                { re: new RegExp(`^${S} vlan( br(ief)?)?$`), out: (f) => `VLAN Name     Status   Ports\n1    default  active   Fa0/3-24\n10   USERS    active   Fa0/1${f ? ', Fa0/2' : ''}\n20   VOICE    active   ${f ? '' : 'Fa0/2'}` },
                { re: new RegExp(`^${S} (ip )?int(erface)?s? (br(ief)?|status)$`), out: (f) => `Interface  Status     Vlan\nFa0/1      connected  10\nFa0/2      connected  ${f ? '10' : '20'}` },
                { re: new RegExp(`^${S} mac( address-table|-address-table)?$`), out: (f) => `Vlan  MAC              Port\n10    0001.4a2b.0001   Fa0/1\n${f ? '10' : '20'}    0001.4a2b.0002   Fa0/2` },
                { re: new RegExp(`^${S} run(ning-config)?$`), out: (f) => `interface FastEthernet0/1\n switchport mode access\n switchport access vlan 10\n!\ninterface FastEthernet0/2\n switchport mode access\n switchport access vlan ${f ? '10' : '20'}` },
                { re: /^ping /, out: (f) => f ? '!!!!!\nSuccess rate is 100 percent' : '.....\nSuccess rate is 0 percent' },
            ],
            fixes: [{ ctx: /^fa/, re: /^switchport access vlan 10$/ }],
        }],
    },
    {
        id: 3, title: 'The missing VLAN', tag: 'Bad trunk', par: 6, parTime: 120,
        story: 'VLAN 10 and VLAN 30 work across the SW1 to SW2 link, but VLAN 20 users on SW2 are cut off. Inspect SW1 and repair the trunk.',
        topo: { nodes: ['SW1', 'SW2'], links: ['Gi0/24 trunk'] },
        hints: ['Look at the trunk port, not the access ports.', 'See which VLANs are allowed on the trunk.', 'On Gi0/24: switchport trunk allowed vlan add 20.'],
        lesson: 'A trunk only carries VLANs in its allowed list. Use "add" so you do not wipe the existing list.',
        devices: [{
            name: 'SW1', prompt: 'SW1',
            cmds: [
                { re: new RegExp(`^${S} int(erface)?s? trunk$`), out: (f) => `Port    Mode  Encap    Status    Native\nGi0/24  on    802.1q   trunking  1\n\nPort    Vlans allowed on trunk\nGi0/24  ${f ? '10,20,30' : '10,30'}` },
                { re: new RegExp(`^${S} vlan( br(ief)?)?$`), out: 'VLAN Name     Status\n10   USERS    active\n20   VOICE    active\n30   SERVERS  active' },
                { re: new RegExp(`^${S} (ip )?int(erface)?s? (br(ief)?|status)$`), out: 'Interface  Status     Vlan\nGi0/24     connected  trunk' },
                { re: new RegExp(`^${S} run(ning-config)?$`), out: (f) => `interface GigabitEthernet0/24\n switchport trunk encapsulation dot1q\n switchport mode trunk\n switchport trunk allowed vlan ${f ? '10,20,30' : '10,30'}` },
            ],
            fixes: [{ ctx: /^gi/, re: /^switchport trunk allowed vlan (add 20|10,20,30|all)$/ }],
        }],
    },
    {
        id: 4, title: 'Lost in the next hop', tag: 'Missing route', par: 5, parTime: 120,
        story: 'The branch LAN 192.168.20.0/24 sits behind R2 (10.0.0.2). Hosts on R1 LAN cannot reach it. Fix R1.',
        topo: { nodes: ['LAN-1', 'R1', 'R2', '192.168.20.0/24'], links: ['Gi0/1', '10.0.0.0/30', 'Gi0/0'] },
        hints: ['Check the routing table on R1.', 'There is no route to 192.168.20.0/24.', 'In global config: ip route 192.168.20.0 255.255.255.0 10.0.0.2'],
        lesson: 'Connected routes come for free. Remote networks need a static route (or a routing protocol) pointing at the next hop.',
        devices: [{
            name: 'R1', prompt: 'R1',
            cmds: [
                { re: new RegExp(`^${S} (ip )?route$`), out: (f) => `C  10.0.0.0/30 is directly connected, Gi0/0\nC  192.168.10.0/24 is directly connected, Gi0/1${f ? '\nS  192.168.20.0/24 [1/0] via 10.0.0.2' : ''}` },
                { re: new RegExp(`^${S} (ip )?int(erface)?s? (br(ief)?|status)$`), out: 'Interface   IP-Address     Status\nGi0/0       10.0.0.1       up\nGi0/1       192.168.10.1   up' },
                { re: /^ping 10\.0\.0\.2$/, out: '!!!!!\nSuccess rate is 100 percent' },
                { re: /^ping 192\.168\.20\.\d+$/, out: (f) => f ? '!!!!!\nSuccess rate is 100 percent' : 'UUUUU\nSuccess rate is 0 percent (destination unreachable)' },
                { re: new RegExp(`^${S} run(ning-config)?$`), out: (f) => `interface GigabitEthernet0/0\n ip address 10.0.0.1 255.255.255.252\ninterface GigabitEthernet0/1\n ip address 192.168.10.1 255.255.255.0${f ? '\nip route 192.168.20.0 255.255.255.0 10.0.0.2' : ''}` },
            ],
            fixes: [{ ctx: /^$/, re: /^ip route 192\.168\.20\.0 255\.255\.255\.0 10\.0\.0\.2$/ }],
        }],
    },
    {
        id: 5, title: 'The dead desk port', tag: 'Port troubleshooting', par: 5, parTime: 120,
        story: 'A new laptop was plugged into SW1 Fa0/3 and the port went dark. The old PC on that desk worked fine yesterday. Find out why the port is down and bring it back.',
        topo: { nodes: ['Laptop', 'SW1'], links: ['Fa0/3'] },
        hints: ['Check the interface status list for anything that is not connected.', 'err-disabled with a port-security cause means a violation shut the port.', 'Enter interface Fa0/3, then no shutdown (after shutdown if you like).'],
        lesson: 'Port security shuts a port into err-disabled when an unknown MAC appears. Clear it with shutdown then no shutdown on the interface, and check the allowed MAC settings so it does not repeat.',
        devices: [{
            name: 'SW1', prompt: 'SW1',
            cmds: [
                { re: new RegExp(`^${S} (ip )?int(erface)?s? (br(ief)?|status)$`), out: (f) => `Port     Status        Vlan  Duplex  Speed\nFa0/1    connected     10    a-full  a-100\nFa0/2    connected     10    a-full  a-100\nFa0/3    ${f ? 'connected    ' : 'err-disabled'} 10    ${f ? 'a-full  a-100' : 'auto    auto'}` },
                { re: new RegExp(`^${S} int(erface)? (fa|fastethernet) ?0/3$`), out: (f) => f ? 'FastEthernet0/3 is up, line protocol is up\n  Full-duplex, 100Mb/s' : 'FastEthernet0/3 is down, line protocol is down (err-disabled)\n  Auto-duplex, Auto-speed' },
                { re: new RegExp(`^${S} (errdisable|err-disable)( recovery)?$`), out: (f) => f ? 'No ports err-disabled.' : 'Fa0/3  psecure-violation  Err-disabled' },
                { re: new RegExp(`^${S} port-security( int(erface)? (fa|fastethernet) ?0/3)?$`), out: (f) => `Port Security              : Enabled\nPort Status                : ${f ? 'Secure-up' : 'Secure-shutdown'}\nViolation Mode             : Shutdown\nMaximum MAC Addresses      : 1\nSecurity Violation Count   : ${f ? '0' : '1'}` },
                { re: new RegExp(`^${S} log(ging)?$`), out: (f) => f ? '%LINK-3-UPDOWN: Interface FastEthernet0/3, changed state to up' : '%PM-4-ERR_DISABLE: psecure-violation error detected on Fa0/3, putting Fa0/3 in err-disable state' },
                { re: new RegExp(`^${S} run(ning-config)?$`), out: (f) => `interface FastEthernet0/3\n switchport mode access\n switchport access vlan 10\n switchport port-security\n${f ? '' : ' shutdown\n'}` },
            ],
            fixes: [{ ctx: /^fa(stethernet)?0\/3$/, re: /^no shutdown$/ }],
        }],
    },
    {
        id: 6, title: 'No link light', tag: 'Hardware troubleshooting', par: 6, parTime: 150,
        story: 'The uplink on SW1 Gi0/1 (a fibre SFP to the core) is dead. The LED is off. Before anyone swaps cables, read the status and decide: bad cable, bad SFP, or the switch refusing the SFP?',
        topo: { nodes: ['SW1', 'Core'], links: ['Gi0/1 SFP'] },
        hints: ['Look at the interface and the transceiver details.', 'The log says the SFP is not supported. Cable and optics are fine.', 'In global config: service unsupported-transceiver.'],
        lesson: 'No link light has three usual causes: cable, optic, or the switch rejecting a third-party SFP. Check show interface, show interfaces transceiver and the logs before swapping hardware.',
        devices: [{
            name: 'SW1', prompt: 'SW1',
            cmds: [
                { re: new RegExp(`^${S} (ip )?int(erface)?s? (br(ief)?|status)$`), out: (f) => `Port     Status        Vlan  Duplex  Speed  Type\nGi0/1    ${f ? 'connected   ' : 'notconnect  '} trunk  ${f ? 'full    1000' : 'auto    auto'}  1000BaseLX` },
                { re: new RegExp(`^${S} int(erface)? (gi|gigabitethernet) ?0/1$`), out: (f) => f ? 'GigabitEthernet0/1 is up, line protocol is up\n  Full-duplex, 1000Mb/s, media type is 1000BaseLX SFP' : 'GigabitEthernet0/1 is down, line protocol is down (notconnect)\n  Auto-duplex, Auto-speed, media type is unknown' },
                { re: new RegExp(`^${S} int(erface)?s? (gi|gigabitethernet)? ?0?/?1? ?transceiver( detail)?$`), out: (f) => f ? 'Gi0/1  Rx power -6.2 dBm  Tx power -4.1 dBm  OK' : 'Gi0/1  Transceiver is not recognized (vendor: ACME-OPT)\n  Tx/Rx power: n/a' },
                { re: new RegExp(`^${S} log(ging)?$`), out: (f) => f ? '%LINK-3-UPDOWN: Interface GigabitEthernet0/1, changed state to up' : '%PHY-4-SFP_NOT_SUPPORTED: The transceiver in Gi0/1 is not supported\n%PM-4-ERR_DISABLE: gbic-invalid error detected on Gi0/1' },
                { re: new RegExp(`^${S} inventory$`), out: 'NAME: "GigabitEthernet0/1 SFP", DESCR: "ACME-OPT 1000BaseLX"' },
                { re: new RegExp(`^${S} run(ning-config)?$`), out: (f) => `${f ? 'service unsupported-transceiver\n' : ''}interface GigabitEthernet0/1\n switchport mode trunk` },
            ],
            fixes: [{ ctx: /^$/, re: /^service unsupported-transceiver$/ }],
        }],
    },
    {
        id: 7, title: 'The noisy port', tag: 'Interface errors', par: 5, parTime: 120,
        story: 'Users on Fa0/12 complain the connection is slow and drops. Other ports look healthy. Read the counters and decide what is wrong with the port.',
        topo: { nodes: ['PC-C', 'SW1'], links: ['Fa0/12'] },
        hints: ['Compare the error counters on Fa0/12 to the other ports.', 'Input errors, CRC and a forced 10 Mb speed point at a bad speed setting.', 'Enter interface Fa0/12, then speed auto.'],
        lesson: 'CRC, runt and input errors on one port often mean a speed or duplex setting that does not match the device, or a damaged cable. Check counters first, then settings, then swap the cable.',
        devices: [{
            name: 'SW1', prompt: 'SW1',
            cmds: [
                { re: new RegExp(`^${S} (ip )?int(erface)?s? (br(ief)?|status)$`), out: (f) => `Port     Status     Vlan  Duplex  Speed\nFa0/11   connected  10    a-full  a-100\nFa0/12   connected  10    ${f ? 'a-full  a-100' : 'a-half    10'}` },
                { re: new RegExp(`^${S} int(erface)? (fa|fastethernet) ?0/12$`), out: (f) => f ? 'FastEthernet0/12 is up, line protocol is up\n  Full-duplex, 100Mb/s\n  0 input errors, 0 CRC, 0 runts' : 'FastEthernet0/12 is up, line protocol is up\n  Half-duplex, 10Mb/s\n  8420 input errors, 8110 CRC, 310 runts' },
                { re: new RegExp(`^${S} int(erface)?s? counters( errors)?$`), out: (f) => `Port     FCS-Err  Align-Err  Runts\nFa0/11   0        0          0\nFa0/12   ${f ? '0        0          0' : '8110     12         310'}` },
                { re: new RegExp(`^${S} int(erface)? (fa|fastethernet) ?0/11$`), out: 'FastEthernet0/11 is up, line protocol is up\n  Full-duplex, 100Mb/s\n  0 input errors, 0 CRC, 0 runts' },
                { re: new RegExp(`^${S} run(ning-config)?$`), out: (f) => `interface FastEthernet0/12\n switchport access vlan 10\n${f ? ' speed auto' : ' speed 10'}` },
            ],
            fixes: [{ ctx: /^fa(stethernet)?0\/12$/, re: /^speed auto$/ }],
        }],
    },
    {
        id: 8, title: 'Boot loop', tag: 'Power and boot', par: 6, parTime: 150,
        story: 'After a power cut, SW1 keeps rebooting. The SYST LED blinks amber. PSUs and fans may be fine. Find out what is wrong from the status and boot info.',
        topo: { nodes: ['PSU', 'SW1'], links: ['Power'] },
        hints: ['Start with show environment: are power and fans OK?', 'Check show boot and show flash. The boot variable points at a file.', 'In global config: boot system flash:c2960-lanbasek9-mz.150-2.SE.bin'],
        lesson: 'Power and boot faults look similar from the outside. Show environment checks PSU and fans; show boot compares the boot variable with what is actually in flash.',
        devices: [{
            name: 'SW1', prompt: 'SW1',
            cmds: [
                { re: new RegExp(`^${S} env(ironment)?( all)?$`), out: 'PSU1: OK   PSU2: OK\nFAN1: OK   FAN2: OK\nTemperature: 36C (OK)' },
                { re: new RegExp(`^${S} boot$`), out: (f) => `BOOT path-list: flash:${f ? 'c2960-lanbasek9-mz.150-2.SE.bin' : 'c2960-old-image.bin'}\nBoot variable: ${f ? 'valid' : 'file not found'}` },
                { re: new RegExp(`^${S} flash:?$`), out: '2  -rwx  c2960-lanbasek9-mz.150-2.SE.bin\n3  -rwx  config.text' },
                { re: new RegExp(`^${S} ver(sion)?$`), out: (f) => f ? 'Cisco IOS 15.0(2)SE, uptime is 3 minutes' : 'Booted from ROMMON recovery. Image not found.' },
                { re: new RegExp(`^${S} run(ning-config)?$`), out: (f) => `${f ? 'boot system flash:c2960-lanbasek9-mz.150-2.SE.bin\n' : 'boot system flash:c2960-old-image.bin\n'}hostname SW1` },
            ],
            fixes: [{ ctx: /^$/, re: /^boot system flash:?c2960-lanbasek9-mz\.150-2\.se\.bin$/ }],
        }],
    },
    {
        id: 9, title: 'The half-empty bundle', tag: 'EtherChannel failure', par: 6, parTime: 150,
        story: 'SW1 and SW2 should be bonded with two links in Port-channel 1, but only half the bandwidth shows up. Gi0/2 is not joining the bundle. Fix SW1.',
        topo: { nodes: ['SW1', 'SW2'], links: ['Po1 (Gi0/1 + Gi0/2)'] },
        hints: ['Check show etherchannel summary and look at flags.', 'Gi0/1 uses LACP active. Gi0/2 is set to mode on.', 'Enter interface Gi0/2, then channel-group 1 mode active.'],
        lesson: 'Every member of an EtherChannel must use the same protocol and settings. Mixing static (on) with LACP (active) keeps a port suspended or out of the bundle.',
        devices: [{
            name: 'SW1', prompt: 'SW1',
            cmds: [
                { re: new RegExp(`^${S} etherchannel( summary)?$`), out: (f) => `Group  Port-channel  Protocol  Ports\n1      Po1(SU)       LACP      Gi0/1(P)  Gi0/2(${f ? 'P' : 's'})` },
                { re: new RegExp(`^${S} (ip )?int(erface)?s? (br(ief)?|status)$`), out: 'Port   Status     Vlan\nGi0/1  connected  trunk\nGi0/2  connected  trunk' },
                { re: new RegExp(`^${S} int(erface)?s? port-channel ?1?$`), out: (f) => `Port-channel1 is up\n  Members: Gi0/1${f ? ', Gi0/2' : ''}\n  Bandwidth ${f ? '2000' : '1000'} Mb/s` },
                { re: new RegExp(`^${S} run(ning-config)?$`), out: (f) => `interface GigabitEthernet0/1\n channel-group 1 mode active\n!\ninterface GigabitEthernet0/2\n channel-group 1 mode ${f ? 'active' : 'on'}` },
            ],
            fixes: [{ ctx: /^gi(gabitethernet)?0\/2$/, re: /^channel-group 1 mode active$/ }],
        }],
    },
    {
        id: 10, title: 'Blocked by the ACL', tag: 'ACL blocking traffic', par: 6, parTime: 150,
        story: 'Host 192.168.10.50 cannot reach the web server 10.1.1.10. Other users in the same LAN also cannot. An ACL on R1 Gi0/1 is the suspect. Find the rule and fix it.',
        topo: { nodes: ['Host', 'R1', 'Web server'], links: ['Gi0/1 ACL in', 'Gi0/0'] },
        hints: ['Show access-lists and look at the match counters.', 'A broad deny sits before the permit, so the permit never matches.', 'In global config: no access-list 101 deny ip 192.168.10.0 0.0.0.255 any'],
        lesson: 'ACLs are read top to bottom and stop at the first match. A broad deny above a specific permit blocks everything. Put specific rules first or remove the offending line.',
        devices: [{
            name: 'R1', prompt: 'R1',
            cmds: [
                { re: new RegExp(`^${S} access-lists?( 101)?$`), out: (f) => f ? 'Extended IP access list 101\n    20 permit tcp host 192.168.10.50 host 10.1.1.10 eq 80 (14 matches)' : 'Extended IP access list 101\n    10 deny ip 192.168.10.0 0.0.0.255 any (212 matches)\n    20 permit tcp host 192.168.10.50 host 10.1.1.10 eq 80 (0 matches)' },
                { re: new RegExp(`^${S} (ip )?int(erface)?s? (br(ief)?|status)$`), out: 'Interface  IP-Address     Status\nGi0/0      10.1.1.1       up\nGi0/1      192.168.10.1   up' },
                { re: new RegExp(`^${S} ip int(erface)? (gi|gigabitethernet) ?0/1$`), out: 'GigabitEthernet0/1 is up\n  Inbound access list is 101' },
                { re: /^ping 10\.1\.1\.10$/, out: (f) => f ? '!!!!!\nSuccess rate is 100 percent' : 'UUUUU\nSuccess rate is 0 percent (administratively prohibited)' },
                { re: new RegExp(`^${S} run(ning-config)?$`), out: (f) => `interface GigabitEthernet0/1\n ip access-group 101 in\n!\n${f ? '' : 'access-list 101 deny ip 192.168.10.0 0.0.0.255 any\n'}access-list 101 permit tcp host 192.168.10.50 host 10.1.1.10 eq 80` },
            ],
            fixes: [
                { ctx: /^$/, re: /^no access-list 101 deny ip 192\.168\.10\.0 0\.0\.0\.255 any$/ },
                { ctx: /^gi(gabitethernet)?0\/1$/, re: /^no ip access-group 101 in$/ },
            ],
        }],
    },
];
