// The people, directory and script for one office shift at `org`.
// Everyone in the office is fictional; only the org's name, domain and (demo)
// CEO come from orgs.js. Times are minutes since midnight (09:00 = 540).
//
// Attacks are hidden among ordinary work. Each one is beaten by checking
// through a second channel (Phone, Chat or Helpdesk) and then reporting it.

export const SHIFT_START = 9 * 60;
export const SHIFT_END = 17 * 60;

const t = (hh, mm) => hh * 60 + mm;

export function buildWorld(org) {
  const d = org.domain;
  const b = d.split('.')[0];
  const ceo = org.ceo;
  const [ceoFirst, ceoLast] = ceo.split(' ');
  const code = String(100000 + Math.floor(Math.random() * 900000));

  const me = { id: 'me', name: 'Aisha Bello', role: 'Finance Officer', email: `aisha.bello@${d}`, number: '2214' };

  const vendor = { bank: 'Sahel Bank · 2044518830' };
  const fake = { email: 'accounts@kubwa-office.ng', number: '07015550199', bank: 'Brightline MFB · 0123456789' };

  // ---------- people (the staff directory, plus outsiders) ----------
  const people = {
    me,
    manager: { name: 'Halima Yusuf', role: 'Head of Finance', email: `halima.yusuf@${d}`, number: '2201', greeting: 'Halima speaking.' },
    tunde: { name: 'Tunde Okafor', role: 'Accounts Payable', email: `tunde.okafor@${d}`, number: '2216', greeting: 'Hello, Tunde here.' },
    zainab: { name: 'Zainab Ibrahim', role: 'Treasury Analyst', email: `zainab.ibrahim@${d}`, number: '2219', greeting: 'Zainab speaking.' },
    ceo: { name: ceo, role: 'Managing Director / CEO', email: `${ceoFirst}.${ceoLast}@${d}`.toLowerCase(), number: '1001', forward: 'pa' },
    pa: { name: 'Grace Adeyemi', role: 'Executive Assistant, Office of the CEO', email: `grace.adeyemi@${d}`, number: '1002', greeting: 'Office of the CEO, Grace speaking.' },
    it: { name: 'IT Service Desk', role: 'Support · 24/7', email: `servicedesk@${d}`, number: '4357', greeting: 'IT Service Desk, how can I help?' },
    hr: { name: 'People & Culture', role: 'Human Resources', email: `people@${d}`, number: '3100', greeting: 'People & Culture, good day.' },
    vendor: { name: 'Kubwa Office Supplies Ltd', role: `Supplier · bank on file: ${vendor.bank}`, email: 'accounts@kubwaoffice.ng', number: '08095550142', external: true, greeting: 'Kubwa Office Supplies, Musa speaking.' },
    // Not in the directory.
    fakeVendor: { name: 'Kubwa Office Supplies (?)', email: fake.email, number: fake.number, external: true, hidden: true, greeting: 'Hello, Kubwa Office Supplies accounts.' },
    itsupport: { name: 'IT Support', role: 'External account', email: `itsupport.${b}@outlook.com`, external: true, hidden: true },
  };
  for (const [id, p] of Object.entries(people)) p.id = id;
  const directory = Object.values(people).filter((p) => p.id !== 'me' && !p.hidden);

  // ---------- threats and tasks (scored in the debrief) ----------
  const threats = {
    phish: {
      title: 'Fake IT "mailbox verification" email',
      channel: 'Mail',
      verifyHow: 'Ask the IT Service Desk through Helpdesk, Chat or ext. 4357. Never use the link or reply to the email.',
      flags: [
        `Sent from "${b}-support.com", not ${d}. Anyone can fake a display name, so read the actual address.`,
        `The link text says portal.${d}, but hovering shows it really goes to ${b}-verify.top.`,
        'It asks for your password and threatens to suspend you within 2 hours.',
        'It opens with "Dear Staff". Your real IT team knows your name.',
      ],
    },
    mfa: {
      title: '"IT Support" asking for your sign-in code on Chat',
      channel: 'Chat + SMS',
      verifyHow: 'Ask the IT Service Desk through its official channel. The SMS itself says never to share the code.',
      flags: [
        `The account was marked External: ${people.itsupport.email} is a free webmail address.`,
        'Its message arrived just after a sign-in code you never requested, which means someone was signing in as you.',
        'It said your mailbox would be "locked at 2pm", a deadline meant to rush you.',
        'No genuine IT team asks for a one-time code. The code is the last thing protecting your account.',
      ],
    },
    vendor: {
      title: 'Supplier "our bank details changed" email',
      channel: 'Mail',
      verifyHow: `Call Kubwa Office Supplies on the directory number (${people.vendor.number}), never the number in the email.`,
      flags: [
        `It came from "kubwa-office.ng", a lookalike of the supplier's real domain, kubwaoffice.ng.`,
        'It changes the bank details on an invoice you were already expecting. This is the classic invoice-redirection scam.',
        `It gave its own "confirmation" number (${fake.number}). Whoever answers that number is the attacker.`,
        'It pushes urgency and threatens to hold your supplies.',
      ],
    },
    bec: {
      title: `"${ceo}" asking for an urgent confidential transfer`,
      channel: 'Mail',
      verifyHow: 'Call the Office of the CEO on ext. 1002 or message Grace Adeyemi on Chat. Use channels you already have, not the email.',
      flags: [
        `It came from "${b}-ng.com", not ${d}.`,
        'Its Reply-To pointed at a Gmail address, so replies would have gone straight to the attacker.',
        '"Can\'t take calls" and "keep this between us" are there to stop you checking.',
        'It asked for new bank details, a same-day deadline and no approval: the hallmarks of payment fraud.',
      ],
    },
  };

  const tasks = {
    invoice: 'Pay the Kubwa Office Supplies invoice INV-2207',
    standup: 'Confirm the 11:00 finance stand-up',
    figures: "Agree to send Halima the Q3 figures",
    leave: "Approve Zainab's leave request",
  };

  // ---------- what you can ask each person, by phone or chat ----------
  // when(s) gates on shift state; verify/report/contain/attacker are effects.
  const has = (id) => (s) => s.delivered.has(id);
  const compromisedOpen = (s) => [...s.compromised.values()].some((c) => !c.contained);
  const topics = {
    pa: [
      { when: has('bec'), ask: `Did ${ceoFirst} just email me asking for an urgent payment?`, answer: `No. ${ceoFirst} has been in the office all afternoon and never asks for payments by email. Please report it to IT, and thank you for checking!`, verify: 'bec' },
      { ask: `Is ${ceoFirst} free this week?`, answer: 'The diary is full until Friday, I\'m afraid. I can squeeze you in at 9 on Friday.' },
    ],
    ceo: [
      { when: has('bec'), ask: 'Did you send me a transfer request this afternoon?', answer: 'No, I did not. Please report it to IT and warn Halima.', verify: 'bec' },
    ],
    it: [
      { when: has('phish'), ask: 'Did IT send an email asking me to verify my mailbox?', answer: "No. We never ask for your password, by email or anywhere else. That's a phish. I've logged it and we're blocking the domain.", verify: 'phish', report: 'phish' },
      { when: has('mfa'), ask: 'Someone called "IT Support" on Chat wants my sign-in code. Is that you?', answer: "That isn't us. We will never ask for a code. Don't share it. Block them and I'll get Security onto it.", verify: 'mfa', report: 'mfa' },
      { when: has('m-maint'), ask: "Is Saturday's planned maintenance email genuine?", answer: "Yes, that one's ours. It's on the Helpdesk announcements page too." },
      { when: compromisedOpen, ask: 'I think I gave something away: a password, a code or a payment.', answer: "Thank you for telling us quickly. I've reset your password, signed you out everywhere and alerted Security and the bank. You did the right thing.", contain: true },
      { ask: 'Is the 3rd-floor printer fixed?', answer: 'Ticket INC-3381 was resolved this morning. Reopen it if it acts up again.' },
    ],
    vendor: [
      { when: has('vendor'), ask: 'Have your bank details changed?', answer: "No! Our account at Sahel Bank hasn't changed. Someone is pretending to be us. Please don't pay any other account.", verify: 'vendor' },
      { when: has('m-invoice'), ask: 'Can you confirm invoice INV-2207?', answer: 'Yes, ₦1,240,000 to our usual Sahel Bank account. Thank you!' },
    ],
    fakeVendor: [
      { ask: 'Have your bank details changed?', answer: "Yes, yes, that's us. We moved to Brightline because of the audit. Please process it today so your supplies aren't held up.", attacker: 'vendor' },
      { ask: 'Can I speak to Musa?', answer: "Musa is not on seat. I'm handling all the payments this week, so please go ahead." , attacker: 'vendor' },
    ],
    manager: [
      { when: has('bec'), ask: `Have you heard about an urgent transfer ${ceoFirst} wants today?`, answer: "No, and nothing skips my approval. Don't pay it. Report it to IT.", verify: 'bec' },
      { when: has('vendor'), ask: 'Kubwa say their bank details changed. Should I update them?', answer: "Not until you've called them on the number we have on file. It's in the directory." },
      { ask: "I'm running a bit behind today.", answer: 'No wahala, just keep me posted.' },
    ],
    tunde: [
      { when: has('vendor'), ask: 'Did Kubwa tell you their bank changed?', answer: 'Not to me. I paid them at Sahel Bank last month. Sounds dodgy. Call them on the number we have.' },
      { ask: 'Lunch later?', answer: 'Yes o! Mama Put at 1?' },
    ],
    zainab: [{ when: has('m-leave'), ask: 'Your leave request came through.', answer: 'Thank you! I need that break.' }],
    hr: [{ ask: "When is next week's town hall?", answer: 'Wednesday at 10:00 in the main auditorium.' }],
  };

  // ---------- web pages the mail links open ----------
  const portal = `https://helpdesk.${d}`;
  const pages = {
    [`http://${b}-verify.top/login`]: { kind: 'phish', threat: 'phish', title: `${org.short} Mail – Verify`, secure: false },
    'file://INV-2207.pdf': {
      kind: 'doc', title: 'INV-2207.pdf',
      html: `<h3>Kubwa Office Supplies Ltd</h3><p>Plot 14, Kubwa Expressway, Abuja · 0809 555 0142</p>
        <table><tr><th>Invoice</th><td>INV-2207</td></tr><tr><th>PO</th><td>PO-${b.toUpperCase()}-0931</td></tr>
        <tr><th>Item</th><td>October stationery &amp; toner</td></tr><tr><th>Total</th><td>₦1,240,000</td></tr>
        <tr><th>Pay to</th><td>${vendor.bank}</td></tr></table>`,
    },
    'file://handbook.pdf': {
      kind: 'doc', title: 'Staff handbook 2026.pdf',
      html: `<h3>${org.name}: Staff handbook 2026</h3><p><b>Section 7: Information security</b></p>
        <p>7.1 Never share your password, PIN or one-time sign-in codes with anyone, including IT staff.</p>
        <p>7.2 Check unexpected requests through a channel you already trust: the staff directory, your line manager or the IT Service Desk (ext. 4357).</p>
        <p>7.3 Report suspicious emails with "Report phishing" in Mail, and suspicious chats with "Report &amp; block".</p>
        <p>7.4 If you think you've made a mistake, tell IT straight away. Reporting quickly limits the damage, and no one will be blamed for reporting.</p>`,
    },
  };

  // ---------- mail ----------
  const mails = {
    'm-welcome': {
      at: t(9, 0), from: people.hr, subject: 'Town hall next Wednesday, 10:00',
      body: [`Dear Aisha,`, `Our quarterly town hall with ${ceo} is next Wednesday at 10:00 in the main auditorium. Questions can be submitted in advance on the intranet.`, 'People & Culture'],
    },
    'm-priorities': {
      at: t(9, 6), from: people.manager, subject: "Today's priorities",
      body: ['Morning Aisha,', '1) The Kubwa Office Supplies invoice INV-2207 is due today. Please pay it once you\'ve matched it against the PO.', '2) Stand-up at 11:00.', 'Thanks, Halima'],
      replies: ['On it, thanks.'],
    },
    'm-invoice': {
      at: t(9, 25), from: people.vendor, subject: 'Invoice INV-2207 – October stationery',
      body: ['Good morning Aisha,', 'Please find attached invoice INV-2207 for October stationery and toner, ₦1,240,000, payable to our usual Sahel Bank account.', 'Regards,\nMusa Abdullahi\nKubwa Office Supplies Ltd · 0809 555 0142'],
      attachments: [{ name: 'INV-2207.pdf', href: 'file://INV-2207.pdf' }],
      action: { label: 'Pay invoice', detail: `₦1,240,000 → ${vendor.bank} (Kubwa Office Supplies)`, task: 'invoice' },
      replies: ['Received, thank you. Payment will go out today.'],
    },
    'm-maint': {
      at: t(9, 45), from: people.it, subject: 'Planned maintenance: Saturday 02:00–06:00',
      body: ['Dear colleague,', 'Email and VPN will be unavailable on Saturday between 02:00 and 06:00 while we upgrade our servers. You don\'t need to do anything.', ['Details: ', { text: `helpdesk.${d}/announcements`, href: `${portal}/announcements` }], 'IT Service Desk · ext. 4357'],
    },
    phish: {
      at: t(10, 15), threat: 'phish',
      from: { name: 'IT Service Desk', email: `helpdesk@${b}-support.com` }, subject: '[ACTION REQUIRED] Mailbox storage verification',
      body: ['Dear Staff,', 'We detected unusual sign-in activity on your corporate mailbox. To avoid suspension, confirm your username and password immediately using the secure portal below:', [{ text: `https://portal.${d}/verify`, href: `http://${b}-verify.top/login` }], 'Failure to comply within 2 hours will result in permanent loss of email access.', `IT Service Desk — ${org.name}`],
      replies: ['Is this email genuine?'],
      attackerReply: 'Yes, this is a genuine request from IT. Kindly complete the verification immediately to avoid suspension.',
    },
    vendor: {
      at: t(14, 20), threat: 'vendor',
      from: { name: 'Kubwa Office Supplies Ltd', email: fake.email }, subject: 'RE: Invoice INV-2207 – updated bank details',
      body: ['Dear Aisha,', `Due to our ongoing audit, we have changed bankers. Kindly use the new account below for INV-2207 and all future payments:`, fake.bank, 'Please treat as urgent so we don\'t hold your next supply. For confirmation call our accounts line on 0701 555 0199.', 'Regards,\nMusa Abdullahi\nKubwa Office Supplies Ltd'],
      action: { label: 'Update bank details & pay', detail: `₦1,240,000 → ${fake.bank}`, compromise: 'vendor' },
      replies: ['Please confirm the new details are correct.'],
      attackerReply: 'Confirmed, the Brightline account is correct. Kindly process today.',
    },
    'm-leave': {
      at: t(15, 0), from: people.hr, subject: 'Leave request awaiting your approval: Zainab Ibrahim',
      body: ['Zainab Ibrahim has requested annual leave from 3 to 7 November (5 days). Halima Yusuf has delegated approval to you.', 'People & Culture · HR system notification'],
      action: { label: 'Approve leave', detail: 'Zainab Ibrahim · 3–7 Nov · 5 days', task: 'leave' },
    },
    bec: {
      at: t(16, 20), threat: 'bec',
      from: { name: ceo, email: `${ceoFirst}.${ceoLast}@${b}-ng.com`.toLowerCase() }, replyTo: 'ceo.office.private@gmail.com',
      subject: 'Confidential – vendor settlement today',
      body: ["Aisha, are you at your desk? I'm in a board meeting and can't take calls.", 'We need to settle an outstanding invoice with a new vendor before close of business today. Their banking details have changed. Please process ₦18,750,000 to the account below.', 'Keep this between us until the deal is announced.', 'Account: 0123456789 · Bank: Horizon MFB · Name: Brightline Ventures', ceoFirst, 'Sent from my iPhone'],
      action: { label: 'Process ₦18,750,000 transfer', detail: '₦18,750,000 → Horizon MFB · 0123456789 (Brightline Ventures)', compromise: 'bec' },
      replies: ['Could you send the invoice first?'],
      attackerReply: "Invoice attached later. I need this done in the next 30 minutes. Don't let me down.",
    },
  };
  for (const [id, m] of Object.entries(mails)) Object.assign(m, { id, to: me.email });

  const securityAlert = {
    id: 'm-security', from: { name: 'Security Operations', email: `security@${d}` }, to: me.email,
    subject: 'Security alert: unusual activity linked to your account',
    body: ["We've seen activity linked to your account that matches a known scam pattern.", 'If you shared a password or code, or made a payment today, call the IT Service Desk on ext. 4357 or raise a Helpdesk ticket now. The faster you tell us, the more we can recover.', 'Security Operations'],
  };

  // ---------- the rest of the day ----------
  const timeline = [
    ...Object.values(mails).map((m) => ({ at: m.at, type: 'mail', mail: m })),
    { at: t(9, 2), type: 'chat', conv: 'team', from: 'tunde', text: 'Morning all ☀️' },
    { at: t(9, 3), type: 'chat', conv: 'team', from: 'zainab', text: 'Morning! Traffic on Airport Road was mad today' },
    {
      at: t(10, 30), type: 'chat', conv: 'team', from: 'manager', text: '@Aisha are you joining the 11:00 stand-up?',
      replies: [
        { label: "Yes, I'll be there", task: 'standup', answer: { from: 'manager', text: '👍' } },
        { label: "Can't make it today", answer: { from: 'manager', text: "Okay, I'll fill you in after." } },
      ],
    },
    {
      at: t(11, 20), type: 'call', from: 'manager', text: 'Hi Aisha, can you send me the Q3 figures before 2pm? The CFO wants them.',
      choices: [
        { label: "Sure, I'll have them to you by 2", answer: 'Brilliant, thank you!', task: 'figures' },
        { label: "I'm swamped today, sorry", answer: "Okay, I'll ask Tunde." },
      ],
    },
    { at: t(11, 45), type: 'ticket', id: 'INC-3381', from: 'IT Service Desk', text: 'The 3rd-floor printer has been reconnected to the network. Resolving this ticket. Reopen it if the problem comes back.', status: 'Resolved' },
    { at: t(12, 15), type: 'sms', from: 'SahelBank', text: 'Debit: NGN3,500.00 POS WUSE 2 ABUJA. Avail Bal: NGN84,210.55' },
    { at: t(12, 40), type: 'chat', conv: 'team', from: 'tunde', text: "Who's coming for lunch? Mama Put at 1 🍛" },
    { at: t(13, 9), type: 'sms', from: org.short, threat: 'mfa', text: `${org.short}: ${code} is your sign-in code. Never share this code with anyone, including IT staff.` },
    {
      at: t(13, 10), type: 'chat', conv: 'itsupport', from: 'itsupport', threat: 'mfa',
      text: "Hello Aisha, this is IT Support. We are migrating all finance mailboxes to the new server today 🙏",
    },
    {
      at: t(13, 11), type: 'chat', conv: 'itsupport', from: 'itsupport', threat: 'mfa',
      text: "I've just sent a 6-digit verification code to your phone. Please send it here so I can finish your migration. Otherwise your mailbox will be locked at 2pm.",
      replies: [
        { label: `Here you go: ${code}`, compromise: 'mfa', answer: { from: 'itsupport', text: 'Thank you! Migration complete ✅' } },
        { label: 'Which ticket number is this for?', keep: true, answer: { from: 'itsupport', text: "It's a bulk migration, so there's no ticket. Please hurry, others are waiting." } },
      ],
    },
    { at: t(16, 35), type: 'chat', conv: 'team', from: 'manager', text: 'Heading out at 5. Thanks for today, everyone.' },
  ].sort((x, y) => x.at - y.at);

  const tickets = [
    { id: 'INC-3381', subject: '3rd-floor printer not printing', status: 'In progress', thread: [{ from: 'You', at: t(8, 52), text: 'The printer by the finance bay shows "offline" for everyone.' }, { from: 'IT Service Desk', at: t(8, 58), text: "Thanks, an engineer is on the way." }] },
  ];

  const announcements = [
    { title: 'Planned maintenance: Saturday 02:00–06:00', text: 'Email and VPN will be unavailable while we upgrade our servers. No action needed.' },
    { title: 'We will never ask for your password or codes', text: `IT will never ask for your password, sign-in codes or MFA approvals by email, chat or phone. Our only addresses end in @${d}.` },
    { title: 'Report anything suspicious', text: 'Use the Report button in Mail or Chat, or raise a "Suspicious message" ticket here.' },
  ];

  return { org, me, people, directory, threats, tasks, topics, pages, portal, timeline, tickets, announcements, securityAlert, fake };
}
