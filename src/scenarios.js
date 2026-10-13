// Drill scenarios. Every text segment is clickable; segments with `flag`
// are the red flags players should find. `href` makes a segment a link.

const base = (domain) => domain.split('.')[0];

export function phishing(org) {
  const b = base(org.domain);
  return {
    kind: 'Phishing',
    title: 'Credential-harvesting phish',
    from: [{ text: 'IT Service Desk ' }, { text: `<helpdesk@${b}-support.com>`, flag: 'sender' }],
    to: `you@${org.domain}`,
    subject: [{ text: '[ACTION REQUIRED] ', flag: 'urgency' }, { text: 'Mailbox storage verification' }],
    time: '09:12',
    body: [
      [{ text: 'Dear Staff,', flag: 'generic' }],
      [
        { text: 'We detected unusual sign-in activity on your corporate mailbox. ' },
        { text: 'To avoid suspension, confirm your username and password immediately', flag: 'credentials' },
        { text: ' using the secure portal below:' },
      ],
      [{ text: `https://portal.${org.domain}/verify`, href: `http://${b}-verify.top/login`, flag: 'link' }],
      [{ text: 'Failure to comply within 2 hours will result in permanent loss of email access.', flag: 'threat' }],
      [{ text: `IT Service Desk — ${org.name}` }],
    ],
    flags: {
      sender: `The address is on "${b}-support.com", not ${org.domain}. Display names are free to fake — always read the actual address.`,
      urgency: 'Manufactured urgency ("ACTION REQUIRED") is designed to rush you past careful thinking.',
      generic: `A generic greeting. Your real IT team knows your name.`,
      credentials: 'No legitimate IT team asks you to type your password into a link from an email.',
      link: `The text shows portal.${org.domain}, but hovering reveals it goes to ${b}-verify.top.`,
      threat: 'Threats of losing access are a classic pressure tactic.',
    },
    actions: [
      { label: 'Report it with the Phish Alert button', points: 40, verdict: 'good', feedback: 'Correct. Reporting lets the security team block the domain and warn colleagues.' },
      { label: 'Delete it quietly', points: 20, verdict: 'ok', feedback: 'You are safe, but colleagues who got the same email are not. Reporting is better.' },
      { label: 'Open the link and sign in', points: 0, verdict: 'bad', feedback: 'Your credentials are now with the attacker. Change your password and call IT immediately.' },
      { label: 'Reply asking if it is genuine', points: 5, verdict: 'bad', feedback: 'The attacker controls that inbox and will happily say yes. Verify through a channel you already trust.' },
    ],
  };
}

export function bec(org) {
  const [first, last] = org.ceo.split(' ');
  const b = base(org.domain);
  return {
    kind: 'Business Email Compromise',
    title: 'CEO payment fraud',
    from: [{ text: `${org.ceo} ` }, { text: `<${first.toLowerCase()}.${last.toLowerCase()}@${b}-ng.com>`, flag: 'sender' }],
    replyTo: [{ text: `ceo.office.private@gmail.com`, flag: 'replyTo' }],
    to: `finance.officer@${org.domain}`,
    subject: [{ text: 'Confidential — ', flag: 'secrecy' }, { text: 'vendor settlement today' }],
    time: '16:41',
    body: [
      [{ text: 'Are you at your desk? ' }, { text: "I'm in a board meeting and can't take calls.", flag: 'unreachable' }],
      [
        { text: 'We need to settle an outstanding invoice with a new vendor ' },
        { text: 'before close of business today.', flag: 'urgency' },
        { text: ' ' },
        { text: 'Their banking details have changed', flag: 'bankchange' },
        { text: ' — please process ₦18,750,000 to the account below.' },
      ],
      [{ text: 'Keep this between us until the deal is announced.', flag: 'bypass' }],
      [{ text: 'Account: 0123456789 · Bank: Horizon MFB · Name: Brightline Ventures' }],
      [{ text: first }],
      [{ text: 'Sent from my iPhone' }],
    ],
    flags: {
      sender: `The CEO's mail would come from ${org.domain}; "${b}-ng.com" is a lookalike domain.`,
      replyTo: 'Replies are silently redirected to a free Gmail account the attacker controls.',
      secrecy: '"Confidential" framing discourages you from checking with anyone else.',
      unreachable: 'Making themselves unreachable by phone stops you from verifying — the core BEC trick.',
      urgency: 'A same-day deadline leaves no time for normal approval.',
      bankchange: 'Changed bank details are the single biggest red flag in payment fraud.',
      bypass: 'Asking you to keep it quiet means skipping the dual-approval controls that protect you.',
    },
    actions: [
      { label: "Call the CEO's office on the number in the staff directory", points: 40, verdict: 'good', feedback: 'Correct. Out-of-band verification on a number you already have defeats BEC every time.' },
      { label: 'Forward to security and your line manager', points: 35, verdict: 'good', feedback: 'Good. Escalating stops the payment and lets security hunt for other targets.' },
      { label: 'Reply asking for the invoice first', points: 5, verdict: 'bad', feedback: 'The attacker will send a convincing fake invoice. Never verify through the same channel.' },
      { label: 'Process the payment — it is the CEO', points: 0, verdict: 'bad', feedback: '₦18.75m is gone. Nigerian banks can sometimes freeze funds if you report within hours — call your bank now.' },
    ],
  };
}
