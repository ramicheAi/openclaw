# Themis · GTM Playbook

How to put Themis in front of paying customers tomorrow. Not theory —
copy-paste templates, scripts, and a 60-day plan.

---

## 0. The one-line pitch

> **Themis is the only AI for litigation that can't fabricate a citation.
> Post-Mata v. Avianca, that's the only category that matters.**

Variants by audience:
- **Solo plaintiff lawyer**: "Drop a draft demand letter into Themis. Every case
  citation gets checked against CourtListener; every Bates against your
  matter. Catch fabrications before you file, not at a Rule 11 hearing."
- **Mid-firm managing partner**: "Themis is the evidence layer your
  associates and paralegals plug their AI work into so you stop worrying
  about which one of them will be the next Schwartz or LoDuca."
- **Insurance carrier**: "Themis verifies every citation in every filing.
  Firms that subscribe demonstrate measurable risk reduction. Talk to us
  about a premium discount program."

---

## 1. Cold email templates

### 1A. Solo plaintiff lawyer (PI / employment)

Subject: **Caught a fake citation in 8 seconds — would have saved $5,000**

> Hi {{firstName}},
>
> Saw your post about the {{practice area}} case in {{forum}}. Quick offer.
>
> I built Themis — an evidence-intelligence tool for litigation. The wedge
> is free: paste any draft brief at themis.law/cite-check and every case
> citation gets verified against CourtListener in under a minute. If
> anything's fabricated (the Mata v. Avianca pattern), you see it
> immediately. No account, no sign-up.
>
> The full app does the same for Bates citations against your matter's
> corpus, plus chronology + depo outlines + damages model + court-ready
> AI-use certification. $99/mo for solos. 14-day free trial.
>
> If it's useful, great. If not, no follow-up.
>
> — {{your name}}
> {{calendly link}}

Notes: keep it under 90 seconds to read. The free Cite Check link is the
hook. Don't pitch a demo in the first touch.

### 1B. Mid-firm managing partner

Subject: **A 90-second look — keeping your firm out of the next Mata v. Avianca**

> {{partner first name}},
>
> One question: when an associate at your firm uses ChatGPT (Claude,
> CoCounsel, Harvey, whatever) to draft something, who verifies every
> citation before it leaves the building?
>
> Themis verifies them by construction. Every case citation gets checked
> against CourtListener. Every Bates against the matter corpus. Every
> action is hash-chained for audit. Filings carry a public attestation
> hash a judge's clerk can verify in one click.
>
> Firms our size pay $499/mo (Firm, 5 seats) or $1,499/mo (Firm Pro, 25
> seats). 14-day free trial. SOC 2 audit underway.
>
> Worth a 20-minute look? I can show you with one of your own past
> motions — paste the text, see the verdict live.
>
> {{calendly link}}
>
> — {{your name}}

### 1C. Paralegal / legal ops

Subject: **The chronology + depo outline took 4 hours. Themis does it in 30.**

> Hi {{firstName}},
>
> Every paralegal I've shown Themis to has the same reaction at minute 8:
> "Wait — it grounded every event in a Bates cite automatically?"
>
> The product:
>   • Drop your matter's docs in. Themis builds the chronology, names the
>     witnesses, runs the privilege scan.
>   • Pick any witness → instant deposition outline with Bates-cited exhibits.
>   • Click "Generate demand letter" — every factual sentence carries an
>     inline citation. Authority slots are placeholders so we never fabricate.
>   • Cite Check verifies every authority against CourtListener before
>     filing.
>
> Solo plan is $99/mo. Firm plan is $99/seat with team roles.
>
> Want me to set up a sandbox with one of your past matters so you can see
> it on your own work?
>
> — {{your name}}

### 1D. Insurance carrier (ALPS / ProAssurance / Bar Plan / CNA)

Subject: **Verifiable risk reduction for AI-related malpractice — Themis**

> {{Name}},
>
> Damien Charlotin's tracker logged 1,348 documented AI-fabrication cases
> in courts worldwide as of 2026, 915 in US courts. Sullivan & Cromwell
> apologized to Chief Judge Glenn in April for ~28 hallucinated citations.
>
> Themis is the evidence-intelligence platform that verifies every legal
> citation against CourtListener before it leaves the firm. Every filing
> generates a public attestation hash (themis.law/verify/<hash>) with the
> matter's hash-chained audit log anchor.
>
> Two ideas worth exploring:
>
> 1. **Premium discount program** — 10% off cyber + E&O for firms that
>    file with Themis certifications. We share the audit data your
>    underwriters need to verify usage.
>
> 2. **Carrier-bundled tier** — Themis as a covered service for your
>    insured firms, billed through the policy.
>
> Either way, we're aligned on outcome: fewer Rule 11 sanctions, fewer
> claims. 30 minutes next week?
>
> {{calendly link}}
>
> — {{your name}}

---

## 2. Demo script (20 minutes)

Use shared screen. Have a real matter open — your own Oliveira file or a
sanitized version. Don't show fake data.

### Minute 0-2: The frame
- Open `/cite-check`. Paste in something with the Varghese cite + one
  real Mata cite + one Bates from the matter. Run it.
- Pause. Let them see NOT FOUND fire red on Varghese.
- "This is the Mata pattern. We catch it in 8 seconds. No account
  needed. That's the free tier. Now let me show you what the rest of the
  product does."

### Minute 2-5: Matter ingestion
- Open the dashboard. Click into Oliveira.
- "84 documents — police report, body cam transcripts, depositions,
  medicals. I dropped them in this morning."
- Click **Chronology**. Show the populated timeline. Click an event →
  Bates cite chip → PDF opens at the cited page.
- "Every event grounded in a verified citation. No fabrications possible
  — the model can only cite Bates IDs that resolve."

### Minute 5-9: Trust posture
- Click **Audit Log** in the left rail. Show the firm-wide feed.
- Click a row → matter opens. "Every action hash-chained. Tampering
  surfaces the broken row."
- Open **Cite Check** (⌘6). Paste in a draft motion. Run.
- Click "Generate certification". Show the result, hand-edit the filing
  field, generate.
- Show the public `/verify/<hash>` page — "This URL goes on every filing.
  Opposing counsel pastes it, sees what was checked, when, by whom."

### Minute 9-13: The killer paralegal feature
- Open any witness in the dossier.
- Click "Build deposition outline."
- Pause. "This took my paralegal 4 hours before. Watch what comes back."
- Read one or two questions out loud. Point at the Bates chips on each
  exhibit list.
- "Topics ordered: foundation → substance → impeachment. Every exhibit
  is real."

### Minute 13-16: Drafting + damages
- Open **Draft** (⌘7). Pick "Demand letter."
- Show the addressee + demand-amount fields. Generate.
- Skim the result. Point at the inline Bates chips. Point at the
  `[AUTHORITY: ...]` placeholder.
- "Themis NEVER fabricates a case. Authority slots are placeholders to
  sweep through Cite Check."
- Open **Damages** (⌘8). Show the line items. Switch to the settlement
  statement draft → numbers flow through verbatim.

### Minute 16-19: Plan + objections
- Open **Settings → Billing**. Show the plan tier + quota meters.
- "Solo is $99/mo. Firm 5-pack is $99/seat. 14-day trial."
- Common objections:
  - **"Is my client data shared with Anthropic?"** No persistent storage on
    their side, per-request only. Enterprise tier offers BAA + dedicated
    infra.
  - **"What if Cite Check is wrong?"** It's only as good as CourtListener's
    coverage (federal + most state appellate). Anything missing falls
    back to AMBIGUOUS, not VERIFIED.
  - **"How do you handle privilege?"** Privilege wall is inviolable —
    flagged/withheld docs never appear in chat, drafts, or shared views.

### Minute 19-20: The ask
- "Want a sandbox loaded with your last closed matter? I'll have it ready
  by tomorrow." Or:
- "What would you need to see in a 14-day trial to feel comfortable
  starting your next matter here?"

Don't pitch. Listen.

---

## 3. ABA Journal / Bob Ambrogi (LawSites) pitch

Subject: **A free tool that detects AI-fabricated citations — for your readers**

> Hi {{name}},
>
> Themis is a new evidence-intelligence platform built specifically
> around the trust gap that Mata v. Avianca opened up. The headline
> feature is free at themis.law/cite-check — anyone, no account, can
> paste a brief and see every case citation verified against
> CourtListener in seconds. Well-formed citations that resolve to
> nothing get flagged in red.
>
> The 2026 stats: 1,348 documented hallucination cases worldwide, 915 in
> US courts, 6 attorneys sanctioned. Sullivan & Cromwell apologized to
> Chief Judge Glenn in April. Themis catches the same shape in 8 seconds.
>
> Happy to walk you through the rest of the product (it does Bates
> verification, depo outlines, drafting, hash-chained audit, public
> attestation badges, the works) if there's a story angle. The free
> tier alone is probably newsworthy: it's the first time anyone's made
> citation verification publicly verifiable.
>
> Anytime next week works.
>
> — {{your name}}
> {{phone}}

---

## 4. First-customer onboarding checklist (the first 10)

For each of your first 10 customers, do this in person or on a Zoom you record:

1. **Pre-call (24h before)**
   - Confirm the matter they want to work in
   - Make sure their plan tier matches their seat count
   - Pre-load 1 of their past matters as a sandbox

2. **Call minute 0-5: warm intro**
   - Ask what just went wrong in their practice this week
   - Look for the specific friction Themis solves (deadline missed, AI
     hallucination scare, depo outline that took 6 hours, etc.)

3. **Minute 5-25: hands-on demo on their matter**
   - YOU drive for the first 10 min
   - Hand the mouse over for the next 15 min
   - Watch every friction point. Take notes. Don't fix anything live.

4. **Minute 25-35: their next 14 days**
   - Pick ONE thing they'll use Themis for this week
   - Set a calendar reminder to check in at day 3, 7, 14

5. **Minute 35-45: friction questions**
   - "What was confusing?"
   - "What's missing that you expected to see?"
   - "What would make this a no-brainer for everyone in your office?"

6. **Post-call (within 24 hours)**
   - Send a personal email with their answers + your commitments
   - Ship one of their friction items within 7 days. ANY one. Send a
     screenshot when it's done.

After the first 10 customers, you'll know exactly what to build for the
next 100.

---

## 5. The 60-day plan

### Days 0-7
- Buy `themis.law` (or alternative) + point at the Fly deployment
- Connect Stripe live mode + create the four products
- Set up Resend with a verified `themis.law` sending domain
- Configure CourtListener API token (free at courtlistener.com/profile/api)
- Recruit 3 friend customers for the first 3 white-glove onboardings

### Days 7-21
- ABA Journal pitch sent (Bob Ambrogi at LawSites, Above the Law,
  ABA TECHREPORT)
- 50 cold emails to solo plaintiff + employment lawyers from your network
- 3 onboarded customers using Themis on real matters
- Publish 2 blog posts:
  1. "How we caught a fabricated citation that would have cost a firm
     $50k" (story-form, anonymized)
  2. "Why the Mata v. Avianca pattern keeps showing up — and what to do"

### Days 21-45
- 10 paying customers ($1k MRR minimum)
- Themis Verified badge embedded in 3+ real filings
- 1 insurance-carrier intro call (warm via an attorney customer)
- Soft-launch on Hacker News (Show HN: Themis — citation verification
  for litigation)

### Days 45-60
- 25 paying customers
- One Clio or MyCase integration shipped
- Word add-in v0 in private beta
- Start SOC 2 prep (Vanta or Drata)

---

## 6. Email signature

```
{{Your name}}
Themis · Evidence Intelligence
{{phone}} · {{your email}}@themis.law
themis.law/cite-check — verify any brief in 8 seconds
```

Use the Themis Verified SVG embed in client emails once you have a
real cert. Free advertising on every reply.

---

## 7. What NOT to do (year 1)

- Don't compete with Westlaw or Lexis on research breadth. You'll lose.
- Don't pursue federal-government contracts. Year 3 conversation.
- Don't promise SOC 2 Type II before Q1 2027.
- Don't undercut your own pricing in pilot deals. Discount via free
  trial extension, never lower-price.
- Don't sell to law schools. Cool logos, no revenue, free-tier abuse.
- Don't build the iOS app yet. Mobile is year 2.
- Don't take VC money before $50k MRR. The product is good enough that
  you don't need anyone's permission.

---

## 8. Resources

- Damien Charlotin's hallucination tracker: search "AI Hallucination Cases Database"
- ABA Model Rules 1.1 (competence), 1.6 (confidentiality), 3.3 (candor)
- Mata v. Avianca, Inc., 678 F. Supp. 3d 443 (S.D.N.Y. 2023)
- Park v. Kim, 91 F.4th 610 (2d Cir. 2023)
- People v. Crabill (Colorado 2023) — first US attorney-discipline ruling
  implicating AI misuse
- Northern District of Illinois standing order on AI-assisted filings
- Eastern District of Pennsylvania standing order on AI use

Pin these in your sales binder.
