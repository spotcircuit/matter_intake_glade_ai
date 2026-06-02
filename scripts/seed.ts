/**
 * Seed the Neon DB with ~8 realistic sample matters so the triage
 * dashboard isn't empty on first load.
 *
 * Coverage:
 *   - All 7 matter types represented at least once.
 *   - Mix of Low / Medium / High urgency.
 *   - One deliberate conflict-check hit: a new matter names "Acme
 *     Industries" as the opposing party, and we also seed Acme as an
 *     existing client. The conflict-flags table is pre-populated for
 *     that matter so the dashboard shows the flag immediately.
 *   - Statuses: 6 in intake_review (the dashboard's primary view),
 *     1 already active, 1 already declined.
 *
 * Run with: `npm run db:seed`
 *
 * Idempotent: deletes all rows from the five tables first, in FK order,
 * then re-inserts. Safe to run repeatedly. Cascades from `matters` clean
 * up children automatically; we explicitly delete clients last.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import {
  auditLog,
  clients,
  conflictFlags,
  extractedFacts,
  matters,
} from "../src/lib/db/schema";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set.");

  const sql = neon(url);
  const db = drizzle(sql);

  // ---- Clear (children first, then parents) ----
  console.log("[seed] clearing existing rows…");
  await db.delete(auditLog);
  await db.delete(conflictFlags);
  await db.delete(extractedFacts);
  await db.delete(matters);
  await db.delete(clients);

  // ---- Existing clients ----
  console.log("[seed] inserting clients…");
  const [acme, glade, vargas, kim] = await db
    .insert(clients)
    .values([
      // The deliberate conflict-check hit lives here.
      { name: "Acme Industries", email: "legal@acme-industries.com" },
      { name: "Glade Holdings LLC", email: "ap@gladeholdings.example" },
      { name: "Maria Vargas", email: "maria.vargas@example.com" },
      { name: "Daniel Kim", email: "dan.kim@example.com" },
    ])
    .returning();

  // ---- Prospective-client matters (each has its own client row) ----
  console.log("[seed] inserting matters…");

  const [m1] = await db
    .insert(matters)
    .values({
      clientId: (
        await db
          .insert(clients)
          .values({
            name: "Sarah Chen",
            email: "sarah.chen@example.com",
          })
          .returning()
      )[0].id,
      matterType: "Personal Injury",
      summary:
        "Pedestrian struck by a delivery van on March 12 at 8th & Howard. ER visit, ongoing PT, lost wages from two weeks off work. Driver's employer is United Logistics.",
      jurisdiction: "California",
      urgency: "High",
      urgencyReason:
        "Statute of limitations clock is running; physical injuries documented and need preserved.",
      status: "intake_review",
      rawDescription:
        "I was hit by a delivery van last week while crossing the street near my office. Went to the ER. Still in physical therapy. The driver works for United Logistics. I missed two weeks of work. What are my options?",
      opposingParty: "United Logistics",
      classificationConfidence: "0.940",
    })
    .returning();

  const [m2] = await db
    .insert(matters)
    .values({
      clientId: (
        await db
          .insert(clients)
          .values({
            name: "Patrick O'Hara",
            email: "patrick.ohara@example.com",
          })
          .returning()
      )[0].id,
      matterType: "Contract Dispute",
      summary:
        "$78,000 invoice unpaid 91 days past due for completed software development work. Opposing party (Acme Industries) is claiming the work was unsatisfactory.",
      jurisdiction: "Delaware",
      urgency: "Medium",
      urgencyReason:
        "No immediate filing deadline, but invoice is past due and client cashflow is at risk.",
      status: "intake_review",
      rawDescription:
        "We did contract software work for Acme Industries. They've refused to pay the final $78k invoice for 91 days. They're now saying the work was 'unsatisfactory.' We have a signed SOW and email approval. Need to know if we should sue or send a demand letter.",
      opposingParty: "Acme Industries",
      classificationConfidence: "0.890",
    })
    .returning();

  const [m3] = await db
    .insert(matters)
    .values({
      clientId: (
        await db
          .insert(clients)
          .values({
            name: "Renee Alvarez",
            email: "renee.a@example.com",
          })
          .returning()
      )[0].id,
      matterType: "Employment",
      summary:
        "Wrongful termination claim — fired one week after disclosing pregnancy. Was a senior PM with 4 years at the company.",
      jurisdiction: "New York",
      urgency: "High",
      urgencyReason:
        "Potential pregnancy discrimination; EEOC charge has a 180-day filing window.",
      status: "intake_review",
      rawDescription:
        "I was fired from my job at NorthPath Tech one week after I told my manager I was pregnant. I had been there 4 years, just got a 'meets expectations' review. They said it was 'restructuring' but my role wasn't eliminated.",
      opposingParty: "NorthPath Tech",
      classificationConfidence: "0.910",
    })
    .returning();

  const [m4] = await db
    .insert(matters)
    .values({
      clientId: (
        await db
          .insert(clients)
          .values({
            name: "James Whitfield",
            email: "jwhitfield@example.com",
          })
          .returning()
      )[0].id,
      matterType: "Estate Planning",
      summary:
        "New will, durable POA, and healthcare directive. Two adult children, modest estate, no business interests.",
      jurisdiction: "Texas",
      urgency: "Low",
      urgencyReason:
        "No urgent triggering event; routine estate-planning engagement.",
      status: "intake_review",
      rawDescription:
        "My wife and I are in our late 60s and have never had wills. Two adult kids, a house, retirement accounts. We'd like to get our affairs in order, including a power of attorney and healthcare directive. No business or anything complicated.",
      opposingParty: null,
      classificationConfidence: "0.970",
    })
    .returning();

  const [m5] = await db
    .insert(matters)
    .values({
      clientId: (
        await db
          .insert(clients)
          .values({
            name: "Dana Brooks",
            email: "dana.brooks@example.com",
          })
          .returning()
      )[0].id,
      matterType: "Family",
      summary:
        "Uncontested divorce, no minor children, modest community property to divide. Both parties want to keep this simple.",
      jurisdiction: "Washington",
      urgency: "Medium",
      urgencyReason:
        "Parties are aligned, but separation has been ~5 months and client wants resolution.",
      status: "intake_review",
      rawDescription:
        "My husband and I have decided to divorce. We don't have kids and we agree on splitting the house and savings. We've been separated about 5 months. We want to make it as quick and uncontested as possible.",
      opposingParty: "Mark Brooks",
      classificationConfidence: "0.960",
    })
    .returning();

  const [m6] = await db
    .insert(matters)
    .values({
      clientId: (
        await db
          .insert(clients)
          .values({
            name: "Lee Ortiz",
            email: "lee.ortiz@example.com",
          })
          .returning()
      )[0].id,
      matterType: "Criminal Defense",
      summary:
        "Arrested for DUI on May 27. First offense, BAC 0.09. Arraignment scheduled June 9.",
      jurisdiction: "Oregon",
      urgency: "High",
      urgencyReason:
        "Arraignment in 7 days — needs counsel before then.",
      status: "intake_review",
      rawDescription:
        "I got a DUI last Saturday. First time. The breathalyzer said 0.09. I have an arraignment on June 9th. I have no record. I need help fast.",
      opposingParty: "State of Oregon",
      classificationConfidence: "0.980",
    })
    .returning();

  // m7 — already accepted, demonstrates 'active' state on dashboard
  const [m7] = await db
    .insert(matters)
    .values({
      clientId: vargas.id,
      matterType: "Contract Dispute",
      summary:
        "Landlord-tenant — security deposit withheld in full, $4,200, for 'damages' not documented at move-out.",
      jurisdiction: "California",
      urgency: "Low",
      urgencyReason:
        "Small-claims-court eligible; not time-sensitive but client wants to file.",
      status: "active",
      rawDescription:
        "My landlord kept my entire $4,200 security deposit and won't itemize damages. I have a clean move-out video and the inspection checklist signed by the property manager.",
      opposingParty: "Westview Property Management",
      classificationConfidence: "0.880",
    })
    .returning();

  // m8 — already declined, demonstrates 'declined' state on dashboard
  const [m8] = await db
    .insert(matters)
    .values({
      clientId: kim.id,
      matterType: "Other",
      summary:
        "Trademark infringement complaint vs. an Etsy seller using a stylistically similar logo. Out of practice area.",
      jurisdiction: "Federal",
      urgency: "Medium",
      urgencyReason:
        "Not urgent in the legal sense; outside the firm's IP practice scope.",
      status: "declined",
      rawDescription:
        "There's an Etsy seller using a logo that looks just like ours. I want to send them a cease and desist.",
      opposingParty: "Etsy Seller (handle: PurpleFoxStudio)",
      classificationConfidence: "0.830",
    })
    .returning();

  // ---- Extracted facts (a few per matter to make the UI feel real) ----
  console.log("[seed] inserting extracted facts…");
  await db.insert(extractedFacts).values([
    // m1 — Personal Injury
    { matterId: m1.id, key: "incident_date", value: "2026-03-12" },
    { matterId: m1.id, key: "incident_location", value: "8th & Howard" },
    { matterId: m1.id, key: "employer_of_driver", value: "United Logistics" },
    { matterId: m1.id, key: "lost_wages_weeks", value: "2" },

    // m2 — Contract Dispute
    { matterId: m2.id, key: "amount_in_dispute_usd", value: "78000" },
    { matterId: m2.id, key: "days_past_due", value: "91" },
    { matterId: m2.id, key: "has_signed_sow", value: "true" },

    // m3 — Employment
    { matterId: m3.id, key: "tenure_years", value: "4" },
    { matterId: m3.id, key: "days_between_disclosure_and_termination", value: "7" },
    { matterId: m3.id, key: "stated_reason", value: "restructuring" },

    // m4 — Estate
    { matterId: m4.id, key: "number_of_beneficiaries", value: "2" },
    { matterId: m4.id, key: "has_business_interests", value: "false" },

    // m5 — Family
    { matterId: m5.id, key: "has_minor_children", value: "false" },
    { matterId: m5.id, key: "months_separated", value: "5" },

    // m6 — Criminal
    { matterId: m6.id, key: "arrest_date", value: "2026-05-27" },
    { matterId: m6.id, key: "bac_reading", value: "0.09" },
    { matterId: m6.id, key: "arraignment_date", value: "2026-06-09" },
    { matterId: m6.id, key: "prior_record", value: "false" },

    // m7 — active
    { matterId: m7.id, key: "deposit_amount_usd", value: "4200" },

    // m8 — declined
    { matterId: m8.id, key: "venue", value: "Etsy marketplace" },
  ]);

  // ---- Conflict flag — deliberate hit on Acme Industries ----
  console.log("[seed] inserting conflict flags…");
  await db.insert(conflictFlags).values({
    matterId: m2.id,
    matchedParty: "Acme Industries",
    matchedClientId: acme.id,
    note: "Opposing party 'Acme Industries' matches an existing client of the firm. Verify whether prior representation creates a conflict before accepting.",
  });

  // m4 has no conflict; m1, m3, m5, m6, m7, m8 also no conflict.

  // ---- Audit log — one creation entry per matter, plus the
  //      acceptance/decline entries for m7 / m8.
  console.log("[seed] inserting audit log…");
  const now = new Date();
  await db.insert(auditLog).values([
    { matterId: m1.id, action: "created", actor: "intake_form" },
    { matterId: m2.id, action: "created", actor: "intake_form" },
    {
      matterId: m2.id,
      action: "conflict_flag_raised",
      actor: "system",
      note: "Matched existing client 'Acme Industries' on opposing-party field.",
    },
    { matterId: m3.id, action: "created", actor: "intake_form" },
    { matterId: m4.id, action: "created", actor: "intake_form" },
    { matterId: m5.id, action: "created", actor: "intake_form" },
    { matterId: m6.id, action: "created", actor: "intake_form" },

    { matterId: m7.id, action: "created", actor: "intake_form" },
    {
      matterId: m7.id,
      action: "accepted",
      actor: "attorney_demo",
      note: "Within practice area; client has documentation. Opening case.",
      createdAt: new Date(now.getTime() - 86_400_000), // yesterday
    },

    { matterId: m8.id, action: "created", actor: "intake_form" },
    {
      matterId: m8.id,
      action: "declined",
      actor: "attorney_demo",
      note: "Outside IP practice area; referring to Mosaic IP.",
      createdAt: new Date(now.getTime() - 86_400_000),
    },
  ]);

  // Silence unused-var warnings for clients we only inserted for shape.
  void glade;

  console.log(
    `[seed] done — 4 existing clients + 8 matters + facts + 1 conflict flag + audit log.`,
  );
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
