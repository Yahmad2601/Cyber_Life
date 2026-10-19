import { esc, h } from '../util.js';

// Mirror Terminal: a small PowerShell-flavoured shell over the Mirror OS file system.
export function createTerminal(ctx) {
  const { fs, world } = ctx;
  const user = world.me.email.split('@')[0];
  const domain = world.org.short.toUpperCase();
  let cwd = 'home'; // 'home' or a folder id
  const history = [];
  let hIndex = 0;

  const el = h(`<div class="term-app"><div class="term-out"></div><label class="term-line"><span class="ps"></span><input spellcheck="false" autocomplete="off" aria-label="Command"></label></div>`);
  const out = el.querySelector('.term-out');
  const input = el.querySelector('input');

  const where = () => (cwd === 'home' ? fs.home : fs.path(fs.get(cwd)));
  const prompt = () => `PS ${where()}> `;
  const print = (text, cls = '') => out.insertAdjacentHTML('beforeend', `<pre class="${cls}">${esc(text)}</pre>`);
  const listing = () => (cwd === 'home' ? ['desktop', 'documents', 'downloads'].map(fs.get) : fs.children(cwd));
  const find = (name) => listing().find((n) => n.name.toLowerCase() === name.toLowerCase());

  function banner() {
    out.innerHTML = '';
    print('Mirror Terminal\nCopyright (C) Mirror Systems. All rights reserved.\n\nType "help" to see the available commands.\n');
  }

  const COMMANDS = {
    help: () =>
      print(
        'Commands:\n  dir, ls            List the items in this folder\n  cd <folder>, cd ..  Change folder\n  type, cat <file>    Show a text file\n  mkdir <name>        Create a folder\n  notepad [file]      Open Notepad\n  start <app>         Open an app (mail, chat, phone, helpdesk, explorer, settings)\n  whoami, hostname, ipconfig, ping <host>, date, systeminfo\n  echo <text>, cls, exit',
      ),
    cls: () => (out.innerHTML = ''),
    clear: () => (out.innerHTML = ''),
    dir: () => {
      const rows = listing();
      if (!rows.length) return print('');
      print(
        `\n    Directory: ${where()}\n\nMode          LastWriteTime      Length Name\n----          -------------      ------ ----\n${rows
          .map((n) => `${n.type === 'folder' ? 'd----' : '-a---'}    ${ctx.stamp(n.modified).padEnd(18)} ${(fs.size(n) || '').padStart(7)} ${n.name}`)
          .join('\n')}\n`,
      );
    },
    ls: () => COMMANDS.dir(),
    pwd: () => print(`\nPath\n----\n${where()}\n`),
    cd: (arg) => {
      if (!arg || arg === '~') return (cwd = 'home');
      if (arg === '..') return (cwd = cwd === 'home' || fs.get(cwd).root ? 'home' : fs.get(cwd).parent);
      const n = find(arg.replace(/[\\/]$/, ''));
      if (!n || n.type !== 'folder') return print(`Set-Location: Cannot find path '${arg}' because it does not exist.`, 'err');
      cwd = n.id;
    },
    type: (arg) => {
      const n = arg && find(arg);
      if (!n || n.type === 'folder') return print(`Get-Content: Cannot find path '${arg || ''}' because it does not exist.`, 'err');
      print(n.content ?? '(binary file)');
    },
    cat: (arg) => COMMANDS.type(arg),
    mkdir: (arg) => {
      if (!arg) return print('mkdir: Missing a folder name.', 'err');
      if (cwd === 'home') return print('mkdir: Access to the path is denied.', 'err');
      const n = fs.create(cwd, 'folder');
      fs.rename(n, arg);
      print(`\n    Directory: ${where()}\n\nd----    ${ctx.stamp(ctx.now())}         ${n.name}\n`);
    },
    notepad: (arg) => {
      const n = arg && find(arg);
      ctx.open('notepad', n && n.type !== 'folder' ? n : undefined);
    },
    start: (arg) => {
      const app = (arg || '').toLowerCase().replace(/\.exe$/, '');
      if (!ctx.apps[app] || app === 'report') return print(`start: This command cannot be run because "${arg}" cannot be found.`, 'err');
      ctx.open(app);
    },
    whoami: () => print(`${domain.toLowerCase()}\\${user}`),
    hostname: () => print(world.device),
    ipconfig: () =>
      print(`\nMirror IP Configuration\n\nWireless LAN adapter Wi-Fi:\n\n   Connection-specific DNS Suffix  . : ${world.org.domain}\n   IPv4 Address. . . . . . . . . . . : 10.24.18.112\n   Subnet Mask . . . . . . . . . . . : 255.255.252.0\n   Default Gateway . . . . . . . . . : 10.24.16.1\n`),
    ping: (arg) => {
      if (!arg) return print('Usage: ping <host>', 'err');
      const ok = arg.endsWith(world.org.domain) || ['8.8.8.8', 'localhost', '127.0.0.1'].includes(arg);
      print(ok ? `\nPinging ${arg} with 32 bytes of data:\nReply from ${arg}: bytes=32 time=4ms TTL=118\nReply from ${arg}: bytes=32 time=3ms TTL=118\nReply from ${arg}: bytes=32 time=5ms TTL=118\n` : `Ping request could not find host ${arg}. Please check the name and try again.`, ok ? '' : 'err');
    },
    date: () => print(`${ctx.dateLong()} ${ctx.clock()}`),
    systeminfo: () =>
      print(`\nHost Name:                 ${world.device}\nOS Name:                   Mirror OS 2 Pro\nOS Version:                2.4.1 Build 26100\nRegistered Owner:          ${world.me.name}\nRegistered Organization:   ${world.org.name}\nSystem Type:               x64-based PC\nTime Zone:                 (UTC+01:00) West Central Africa\nDomain:                    ${world.org.domain}\n`),
    echo: (arg) => print(arg || ''),
    exit: () => ctx.close('terminal'),
  };

  function run(line) {
    print(prompt() + line, 'cmd');
    const [name, ...rest] = line.trim().split(/\s+/);
    if (!name) return;
    const fn = COMMANDS[name.toLowerCase()];
    if (fn) fn(rest.join(' ').replace(/^["']|["']$/g, ''));
    else print(`${name}: The term '${name}' is not recognized as a name of a cmdlet, function, script file, or executable program.`, 'err');
  }

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const line = input.value;
      input.value = '';
      if (line.trim()) history.push(line);
      hIndex = history.length;
      run(line);
    } else if (e.key === 'ArrowUp' && hIndex > 0) input.value = history[--hIndex];
    else if (e.key === 'ArrowDown') input.value = history[++hIndex] ?? ((hIndex = history.length), '');
    else if (e.ctrlKey && e.key.toLowerCase() === 'l') (e.preventDefault(), (out.innerHTML = ''));
    else return;
    el.querySelector('.ps').textContent = prompt();
    out.scrollTop = out.scrollHeight;
    el.scrollTop = el.scrollHeight;
  });
  el.addEventListener('click', () => input.focus());

  banner();
  el.querySelector('.ps').textContent = prompt();
  return {
    id: 'terminal', title: 'Terminal', el, size: [700, 420], offsetX: 160,
    onOpen(arg) {
      if (arg?.cwd) {
        cwd = arg.cwd;
        el.querySelector('.ps').textContent = prompt();
      }
      setTimeout(() => input.focus());
    },
  };
}
