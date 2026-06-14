// Practice-area packs — at matter creation, the operator picks a vertical
// and the matter is seeded with that vertical's defaults: standard claims,
// common defense theories, an evidence checklist (what documents the firm
// should be hunting for), default damages categories, and a starter
// chronology cast of the typical witnesses.
//
// Each pack represents ~$50k of paralegal IP curated into one click.
// Future direction: customer-specific packs at the Enterprise tier.

export type PackId =
  | "general"
  | "personal_injury"
  | "employment"
  | "family"
  | "commercial"
  | "immigration"
  | "perm"
  | "criminal_defense"
  | "ip";

export interface EvidenceItem {
  label: string;
  notes?: string;
  severity?: "high" | "medium" | "low";
}

export interface PackSpec {
  id: PackId;
  label: string;
  blurb: string;
  claims: string[];
  defenses: string[];
  evidenceChecklist: EvidenceItem[];
  damagesCategories: string[];
  witnessRoles: { role: string; org?: string }[];
}

export const PACKS: Record<PackId, PackSpec> = {
  general: {
    id: "general",
    label: "General litigation",
    blurb: "Catch-all defaults. Use when the practice area doesn't match a specialized pack.",
    claims: [],
    defenses: [],
    evidenceChecklist: [],
    damagesCategories: [],
    witnessRoles: [],
  },

  personal_injury: {
    id: "personal_injury",
    label: "Personal Injury",
    blurb: "MVA, premises, product liability. Anchored to medicals + liability evidence.",
    claims: [
      "Negligence",
      "Negligence per se (statutory violation)",
      "Gross negligence / punitive damages",
      "Vicarious liability (employer/principal)",
      "Loss of consortium",
    ],
    defenses: [
      "Contributory / comparative negligence",
      "Assumption of risk",
      "Statute of limitations",
      "Pre-existing condition (causation challenge)",
      "Independent intervening cause",
    ],
    evidenceChecklist: [
      { label: "Police / incident report", severity: "high" },
      { label: "Body cam / dashcam footage", severity: "high" },
      { label: "911 audio + CAD log", severity: "medium" },
      { label: "Photographs of scene + injuries", severity: "high" },
      { label: "ER + hospital records (4 corners)", severity: "high" },
      { label: "Follow-up treating physician records", severity: "high" },
      { label: "Diagnostic imaging (X-ray, MRI, CT) — discs + reports", severity: "high" },
      { label: "Medical bills + payment ledger", severity: "high" },
      { label: "Health insurance EOBs", severity: "medium" },
      { label: "Wage records (W-2, pay stubs, tax returns) for lost-wages claim", severity: "high" },
      { label: "Employer letter re: missed days + accommodations", severity: "medium" },
      { label: "Property damage estimates + repair invoices", severity: "medium" },
      { label: "Vehicle / scene preservation letters (sent + received)", severity: "high" },
      { label: "Witness statements (recorded or written)", severity: "medium" },
      { label: "Defendant insurance declaration page (limits)", severity: "high" },
      { label: "Defendant DUI / driving history (if applicable)", severity: "high" },
      { label: "Cell phone records (distracted driving theory)", severity: "low" },
    ],
    damagesCategories: ["Medical", "Lost wages", "Future care", "Pain & suffering", "Property", "Other"],
    witnessRoles: [
      { role: "Plaintiff" },
      { role: "Defendant" },
      { role: "Investigating officer" },
      { role: "Responding deputy" },
      { role: "Eyewitness" },
      { role: "Treating physician" },
      { role: "Expert — accident reconstruction" },
      { role: "Expert — life-care planner" },
      { role: "Plaintiff's employer (HR/supervisor)" },
    ],
  },

  employment: {
    id: "employment",
    label: "Employment — Plaintiff",
    blurb: "Wrongful termination, discrimination, wage & hour, retaliation.",
    claims: [
      "Title VII discrimination (race / sex / religion / national origin)",
      "ADA failure to accommodate",
      "ADEA age discrimination",
      "FMLA interference / retaliation",
      "FLSA — unpaid overtime / misclassification",
      "Retaliation (whistleblower / protected activity)",
      "State law parallels (FEHA / NYCHRL / etc.)",
      "Wrongful termination in violation of public policy",
    ],
    defenses: [
      "Legitimate non-discriminatory reason (McDonnell Douglas)",
      "Same-actor inference",
      "Failure to mitigate damages",
      "After-acquired evidence doctrine",
      "Arbitration agreement / class waiver",
      "Statute of limitations / EEOC exhaustion failure",
    ],
    evidenceChecklist: [
      { label: "Offer letter + employment agreement", severity: "high" },
      { label: "Employee handbook + policies in effect", severity: "high" },
      { label: "Performance reviews (all years)", severity: "high" },
      { label: "Email + Slack threads — supervisor + HR", severity: "high" },
      { label: "Pay stubs + W-2s (full employment period)", severity: "high" },
      { label: "Time records / clock entries", severity: "high" },
      { label: "EEOC charge + right-to-sue letter", severity: "high" },
      { label: "Termination letter + COBRA notice", severity: "high" },
      { label: "Comparator employee data (similarly situated)", severity: "medium" },
      { label: "Witness statements (coworkers)", severity: "medium" },
      { label: "Job search records (mitigation evidence)", severity: "high" },
      { label: "Replacement employee profile / postings", severity: "medium" },
    ],
    damagesCategories: ["Back pay", "Front pay", "Emotional distress", "Punitive", "Attorney's fees"],
    witnessRoles: [
      { role: "Plaintiff" },
      { role: "Direct supervisor" },
      { role: "HR representative" },
      { role: "Decision-maker" },
      { role: "Comparator coworker" },
      { role: "Expert — economist (damages)" },
      { role: "Treating mental health provider" },
    ],
  },

  family: {
    id: "family",
    label: "Family Law",
    blurb: "Divorce, custody, support modifications, prenups.",
    claims: [
      "Dissolution of marriage",
      "Legal + physical custody",
      "Child support modification",
      "Spousal support / alimony",
      "Asset division (community + separate)",
      "Domestic violence / DVPO",
    ],
    defenses: [
      "Separate property tracing",
      "Change of circumstances (modification)",
      "Best-interest factors against custody change",
      "Imputed income / earning capacity",
    ],
    evidenceChecklist: [
      { label: "Marriage certificate", severity: "high" },
      { label: "Prenup / postnup (if any)", severity: "high" },
      { label: "Joint + separate tax returns (3-5 years)", severity: "high" },
      { label: "Bank + brokerage statements (24 months)", severity: "high" },
      { label: "Retirement account statements", severity: "high" },
      { label: "Real property deeds + mortgage statements", severity: "high" },
      { label: "Income documentation (pay stubs, K-1s, 1099s)", severity: "high" },
      { label: "Children's school + medical records", severity: "medium" },
      { label: "Communication logs (texts, emails) re: kids", severity: "medium" },
      { label: "Custody journal", severity: "medium" },
      { label: "Police reports (DV history if any)", severity: "high" },
    ],
    damagesCategories: ["Support arrears", "Property division", "Attorney's fees"],
    witnessRoles: [
      { role: "Petitioner" },
      { role: "Respondent" },
      { role: "Minor child(ren)" },
      { role: "Custody evaluator / GAL" },
      { role: "Forensic accountant" },
      { role: "Therapist / counselor" },
    ],
  },

  commercial: {
    id: "commercial",
    label: "Commercial Litigation",
    blurb: "Breach of contract, business torts, partnership disputes.",
    claims: [
      "Breach of contract",
      "Breach of the implied covenant of good faith and fair dealing",
      "Fraud / intentional misrepresentation",
      "Negligent misrepresentation",
      "Tortious interference with contract / business relations",
      "Unjust enrichment / quantum meruit",
      "Breach of fiduciary duty (partners / officers)",
      "Unfair competition / business code violations",
    ],
    defenses: [
      "Statute of frauds",
      "Parol evidence rule",
      "Modification / waiver",
      "Failure of consideration",
      "Frustration of purpose / commercial impracticability",
      "Statute of limitations",
      "Equitable estoppel / laches",
    ],
    evidenceChecklist: [
      { label: "Executed contract + all amendments", severity: "high" },
      { label: "Course-of-dealing / prior contract history", severity: "medium" },
      { label: "Email + text negotiations + post-execution communications", severity: "high" },
      { label: "Invoices + payment records", severity: "high" },
      { label: "Bank statements showing performance / non-performance", severity: "high" },
      { label: "Internal memos + minutes referencing the contract", severity: "high" },
      { label: "Performance milestones / delivery receipts", severity: "high" },
      { label: "Damages calculations + supporting financials", severity: "high" },
      { label: "Cure / demand letters (sent + received)", severity: "high" },
      { label: "Replacement contract / cover damages records", severity: "medium" },
    ],
    damagesCategories: ["Expectation damages", "Reliance damages", "Lost profits", "Consequential", "Attorney's fees"],
    witnessRoles: [
      { role: "Plaintiff principal" },
      { role: "Defendant principal" },
      { role: "Contracting officer / signatory" },
      { role: "Project manager" },
      { role: "Accountant / CFO" },
      { role: "Expert — damages / forensic accounting" },
      { role: "Expert — industry custom & practice" },
    ],
  },

  immigration: {
    id: "immigration",
    label: "Immigration",
    blurb: "Removal defense, asylum, family + employment-based petitions.",
    claims: [
      "Asylum (well-founded fear of persecution)",
      "Withholding of removal",
      "Convention Against Torture",
      "Cancellation of removal (LPR / non-LPR)",
      "Adjustment of status",
      "Family-based petitions (I-130 / I-485)",
      "Employment-based petitions (H-1B, EB-2/3, EB-5)",
      "U / T / VAWA self-petition",
    ],
    defenses: [
      "Inadmissibility waivers (212(h), 212(i), 601A)",
      "Crime-of-moral-turpitude / aggravated felony challenges",
      "Material support bar challenges",
      "Particular-social-group definition arguments",
    ],
    evidenceChecklist: [
      { label: "I-94 + entry records", severity: "high" },
      { label: "Passport + visa stamps (all)", severity: "high" },
      { label: "Country conditions reports + State Dept HR reports", severity: "high" },
      { label: "Affidavit + declaration of asylum-seeker", severity: "high" },
      { label: "Corroborating witness declarations", severity: "high" },
      { label: "Medical / psychological evaluations", severity: "high" },
      { label: "Police reports (home country)", severity: "high" },
      { label: "News articles re: persecution pattern", severity: "medium" },
      { label: "Translation certifications (every non-English doc)", severity: "high" },
      { label: "Prior immigration filings + denials", severity: "high" },
      { label: "Criminal history (FBI / state)", severity: "high" },
      { label: "Tax returns (LPR good-moral-character cases)", severity: "high" },
    ],
    damagesCategories: [],
    witnessRoles: [
      { role: "Client / respondent" },
      { role: "Spouse / qualifying relative" },
      { role: "Country-conditions expert" },
      { role: "Medical expert / psychologist" },
      { role: "Pastor / community letter writer" },
    ],
  },

  perm: {
    id: "perm",
    label: "PERM Labor Certification",
    blurb:
      "Employment-based PERM (ETA-9089). Builds the audit-defensible file — every required exhibit, BALCA-proof completeness — because no new evidence is allowed on appeal.",
    // "claims" repurposed as the showings a PERM filing must affirmatively
    // establish — what the certified file has to prove on its face.
    claims: [
      "Bona fide, full-time, permanent job opportunity (open to U.S. workers)",
      "Prevailing wage offered — DOL-issued PWD valid and unexpired at filing",
      "Good-faith recruitment that genuinely tested the U.S. labor market",
      "No able, willing, qualified, and available U.S. worker for the role",
      "Requirements are normal for the occupation (or business-necessity justified)",
      "Worksite, duties, and requirements consistent across PWD, ads, NOF, and ETA-9089",
    ],
    // "defenses" repurposed as the audit-trigger / denial risks to preempt
    // before filing — the recurring reasons PERM cases get audited or denied.
    defenses: [
      "Unduly restrictive / tailored requirements (Kellogg business-necessity exposure)",
      "U.S. applicant rejected for a reason not clearly job-related and lawful",
      "Recruitment defect — wrong ad content, missing step, or out-of-sequence timing",
      "Expired PWD, or filing outside the 180-day window / before the 30-day quiet period",
      "Notice of Filing defect — under 10 business days, wrong location, or missing wage",
      "ETA-9089 answers inconsistent with the underlying recruitment record",
    ],
    evidenceChecklist: [
      { label: "Prevailing Wage Determination (PWD) — DOL-issued, valid + unexpired at filing", severity: "high" },
      { label: "Job description + minimum requirements (as submitted for the PWD)", severity: "high" },
      { label: "Notice of Filing — proof of 10 consecutive business days, with wage + worksite + dates", severity: "high" },
      { label: "Two Sunday newspaper print ads — tearsheets + publisher affidavits + run dates", severity: "high" },
      { label: "State Workforce Agency (SWA) job order — confirmation + 30-day run dates", severity: "high" },
      { label: "Three additional recruitment steps (professional) — dated proof for each (employer website, job fair, journal, campus, employer referral, etc.)", severity: "high" },
      { label: "Recruitment report — disposition of EVERY U.S. applicant + lawful job-related rejection reason", severity: "high" },
      { label: "All applicant resumes / applications received (with date stamps)", severity: "high" },
      { label: "ETA-9089 — filed copy (with internal-consistency check vs. PWD + ads)", severity: "high" },
      { label: "Audit-readiness index — each ETA-9089 answer mapped to its supporting exhibit", severity: "high" },
      { label: "Recruitment timeline — PWD validity, 30-day quiet period, 180-day filing window", severity: "high" },
      { label: "Foreign worker resume + experience letters + credential evaluation (if foreign degree)", severity: "high" },
      { label: "Notice to bargaining representative (if unionized role)", severity: "medium" },
      { label: "Internal company recruitment proof (if relied upon)", severity: "medium" },
      { label: "Employer business legitimacy — FEIN, org info, ability to pay", severity: "medium" },
    ],
    damagesCategories: [],
    witnessRoles: [
      { role: "Foreign worker (beneficiary)" },
      { role: "Employer / petitioner (signatory)" },
      { role: "HR / recruitment coordinator" },
      { role: "Sponsoring attorney" },
      { role: "DOL — prevailing wage / Certifying Officer (audit)" },
      { role: "Credential evaluation service (if foreign degree)" },
    ],
  },

  criminal_defense: {
    id: "criminal_defense",
    label: "Criminal Defense",
    blurb: "Felony + misdemeanor defense, suppression, plea negotiations.",
    claims: [
      "Suppression — 4th Amendment (warrantless search, traffic stop)",
      "Suppression — 5th Amendment (Miranda)",
      "Suppression — 6th Amendment (right to counsel)",
      "Speedy trial violation",
      "Insufficient evidence / motion for acquittal",
      "Self-defense / defense of others",
      "Necessity / duress",
      "Voluntary intoxication (specific intent)",
    ],
    defenses: [
      "Reasonable doubt narrative",
      "Chain of custody challenge",
      "Lab / forensic methodology challenge (Daubert)",
      "Witness credibility (impeachment + bias)",
      "Mistaken identification",
    ],
    evidenceChecklist: [
      { label: "Charging document + criminal complaint", severity: "high" },
      { label: "Police report (all officers)", severity: "high" },
      { label: "Body cam + dashcam (every angle)", severity: "high" },
      { label: "911 audio + CAD logs", severity: "high" },
      { label: "Custodial statements / Mirandized interviews", severity: "high" },
      { label: "Booking video", severity: "medium" },
      { label: "Search warrant + supporting affidavit (if any)", severity: "high" },
      { label: "Lab reports (drugs, DNA, blood, fingerprint)", severity: "high" },
      { label: "Chain-of-custody forms", severity: "high" },
      { label: "Witness statements + grand jury testimony", severity: "high" },
      { label: "Defendant's prior record (Giglio for officers)", severity: "high" },
      { label: "Brady / impeachment material requests", severity: "high" },
    ],
    damagesCategories: [],
    witnessRoles: [
      { role: "Defendant" },
      { role: "Arresting officer" },
      { role: "Detective / investigator" },
      { role: "Lab analyst" },
      { role: "Civilian eyewitness" },
      { role: "Expert — forensics / DNA" },
    ],
  },

  ip: {
    id: "ip",
    label: "IP / Patent",
    blurb: "Patent infringement + defense, trade secrets, trademark, copyright.",
    claims: [
      "Patent infringement (direct + induced + contributory)",
      "Willful infringement (enhanced damages)",
      "Trade secret misappropriation (DTSA + state UTSA)",
      "Trademark infringement / dilution",
      "Copyright infringement",
      "False designation of origin (Lanham §43(a))",
    ],
    defenses: [
      "Non-infringement (claim construction)",
      "Invalidity (anticipation, obviousness, written description)",
      "Inequitable conduct",
      "Estoppel / laches",
      "Fair use (copyright + TM)",
      "Reverse engineering (trade secret defense)",
    ],
    evidenceChecklist: [
      { label: "Patent file history (USPTO prosecution record)", severity: "high" },
      { label: "Accused product specs + technical documentation", severity: "high" },
      { label: "Source code (under protective order)", severity: "high" },
      { label: "Sales + licensing records", severity: "high" },
      { label: "Prior art search results", severity: "high" },
      { label: "Inventor laboratory notebooks", severity: "high" },
      { label: "Expert reports (claim construction + invalidity + damages)", severity: "high" },
      { label: "Communications with USPTO + foreign counterparts", severity: "high" },
    ],
    damagesCategories: ["Lost profits", "Reasonable royalty", "Enhanced damages (willful)", "Attorney's fees (exceptional case)"],
    witnessRoles: [
      { role: "Inventor" },
      { role: "Patent prosecutor" },
      { role: "Accused product engineer" },
      { role: "Expert — claim construction" },
      { role: "Expert — invalidity" },
      { role: "Expert — damages / royalty" },
    ],
  },
};

export function listPacks(): { id: PackId; label: string; blurb: string }[] {
  return Object.values(PACKS).map((p) => ({ id: p.id, label: p.label, blurb: p.blurb }));
}

export function packById(id: string): PackSpec {
  return id in PACKS ? PACKS[id as PackId] : PACKS.general;
}
