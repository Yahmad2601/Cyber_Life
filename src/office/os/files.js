// The files a staff laptop starts the day with.
export function seedFiles(fs, world, ctx) {
  const { org, me, people } = world;
  const d = (dayOffset, hh, mm) => dayOffset * 1440 + hh * 60 + mm;

  fs.add('desktop', { type: 'recycle', name: 'Recycle Bin', system: true, modified: d(-30, 9, 0) });
  for (const app of ['explorer', 'browser', 'mail', 'chat', 'phone', 'helpdesk']) fs.add('desktop', { type: 'app', app, name: ctx.apps[app].baseTitle, modified: d(-30, 9, 0) });

  const briefing = fs.add('desktop', {
    type: 'txt', name: 'Shift briefing.txt', modified: d(0, 8, 47),
    content: `SHIFT BRIEFING · ${ctx.dateLong()}
================================================

You are ${me.name}, ${me.role} at ${org.name}.
Your shift runs from 09:00 to 17:00.

TODAY
  - Work through Mail, Chat, Phone and the IT Helpdesk as you normally would.
  - Pay what's due, answer your colleagues and approve requests.

REMEMBER
  - Not everything that arrives today will be what it seems.
  - If something feels off, don't check it by replying to the same message.
    Check it through a channel you already trust: the staff directory in
    Phone, a colleague on Chat, or the IT Helpdesk.
  - Then report it.

TIPS
  - Right-click the desktop for the usual options (View, Sort by, New...).
  - Quick settings (Wi-Fi / volume / battery, bottom right) has a
    "Shift speed" control if you want the day to move faster.
  - Start > Power > Shut down clocks you out early.
`,
  });

  const fin = fs.add('desktop', { type: 'folder', name: 'Finance', modified: d(-2, 16, 20) });
  fs.add(fin.id, { type: 'csv', name: 'Payment run October.csv', modified: d(-1, 15, 5), content: 'Vendor,Invoice,Amount (NGN),Status\nKubwa Office Supplies Ltd,INV-2207,1240000,Due today\nAbuja Facility Services,AFS-1180,860000,Paid\nSkyline Couriers,SC-0442,95000,Paid\n' });

  fs.add('documents', {
    type: 'txt', name: 'Finance procedures.txt', modified: d(-12, 11, 30),
    content: `${org.short.toUpperCase()} FINANCE · PAYMENT CONTROLS (extract)

1. Every payment needs a PO and an invoice that match.
2. Any change to a supplier's bank details MUST be confirmed by phone,
   using the number already held in the staff/vendor directory.
   Never use a phone number or link supplied in the email requesting the change.
3. Payments above NGN 5,000,000 need two approvers (the Head of Finance plus one other).
4. Executives do not request urgent or confidential transfers by email.
   If one arrives, call the Office of the CEO on ext. 1002 and report it to IT.
5. Suspicious messages: use "Report phishing" in Mail or raise a Helpdesk ticket.
`,
  });
  fs.add('documents', {
    type: 'csv', name: 'Vendor list.csv', modified: d(-20, 10, 2),
    content: `Vendor,Contact,Phone on file,Bank on file\n${people.vendor.name},Musa Abdullahi,${people.vendor.number},Sahel Bank 2044518830\nAbuja Facility Services,Ngozi Eze,08095550310,Unity Bank 1188200341\nSkyline Couriers,Femi Ade,08095550774,Sahel Bank 2044190922\n`,
  });
  fs.add('documents', { type: 'csv', name: 'Q3 figures.csv', modified: d(-1, 17, 48), content: 'Line,Q1,Q2,Q3\nOperating income,412.6,428.1,451.9\nStaff costs,188.2,190.4,193.0\nAdmin expenses,64.1,61.7,66.3\n(NGN millions)\n' });
  fs.add('downloads', { type: 'pdf', name: 'Staff handbook 2026.pdf', size: '1,284 KB', href: 'file://handbook.pdf', modified: d(-40, 14, 12) });
  return { briefing };
}
