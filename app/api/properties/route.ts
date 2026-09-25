import { NextRequest } from "next/server";
import { getScopedRepo, unauthorized } from "@/lib/repo/scoped";
import type { PropertyType } from "@/lib/db/properties";

// Properties (address, mortgage, expenses, rental income). Single
// action-discriminated route, same convention as /api/recurring and
// /api/categories — a full CRUD surface for four sub-resources doesn't get
// its own nested dynamic route in this codebase, it gets an `action` field.

const PROPERTY_TYPES: PropertyType[] = ["primary", "rental", "vacation", "other"];
const RATE_MIN = 0;
const RATE_MAX = 25;
const AMORTIZATION_MIN_YEARS = 1;
const AMORTIZATION_MAX_YEARS = 40;

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const repo = await getScopedRepo(request);
  if (!repo) return unauthorized();
  return Response.json({ properties: await repo.properties.list() });
}

export async function POST(request: NextRequest) {
  const repo = await getScopedRepo(request);
  if (!repo) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const action = body.action;

  switch (action) {
    case "create_property": {
      const name = body.name;
      const propertyType = body.property_type;
      if (typeof name !== "string" || !name.trim()) {
        return badRequest("name required");
      }
      if (!PROPERTY_TYPES.includes(propertyType as PropertyType)) {
        return badRequest(`property_type must be one of ${PROPERTY_TYPES.join(", ")}`);
      }
      const monthlyRentalIncome =
        body.monthly_rental_income === undefined || body.monthly_rental_income === null
          ? null
          : Number(body.monthly_rental_income);
      if (monthlyRentalIncome !== null && !Number.isFinite(monthlyRentalIncome)) {
        return badRequest("monthly_rental_income must be a number");
      }
      const id = await repo.properties.create({
        name: name.trim(),
        address: typeof body.address === "string" ? body.address : null,
        property_type: propertyType as PropertyType,
        monthly_rental_income: monthlyRentalIncome,
      });
      return Response.json({ id, property: await repo.properties.get(id) });
    }

    case "update_property": {
      const id = Number(body.id);
      const name = body.name;
      const propertyType = body.property_type;
      if (!Number.isFinite(id)) return badRequest("id required");
      if (typeof name !== "string" || !name.trim()) {
        return badRequest("name required");
      }
      if (!PROPERTY_TYPES.includes(propertyType as PropertyType)) {
        return badRequest(`property_type must be one of ${PROPERTY_TYPES.join(", ")}`);
      }
      const monthlyRentalIncome =
        body.monthly_rental_income === undefined || body.monthly_rental_income === null
          ? null
          : Number(body.monthly_rental_income);
      if (monthlyRentalIncome !== null && !Number.isFinite(monthlyRentalIncome)) {
        return badRequest("monthly_rental_income must be a number");
      }
      await repo.properties.update(id, {
        name: name.trim(),
        address: typeof body.address === "string" ? body.address : null,
        property_type: propertyType as PropertyType,
        monthly_rental_income: monthlyRentalIncome,
      });
      return Response.json({ property: await repo.properties.get(id) });
    }

    case "delete_property": {
      const id = Number(body.id);
      if (!Number.isFinite(id)) return badRequest("id required");
      await repo.properties.delete(id);
      return Response.json({ ok: true });
    }

    case "set_mortgage": {
      const propertyId = Number(body.property_id);
      const outstandingAmount = Number(body.outstanding_amount);
      const rate = Number(body.rate);
      const amortizationYears = Number(body.amortization_years);
      const dateOpened = body.date_opened;
      if (!Number.isFinite(propertyId)) return badRequest("property_id required");
      if (!Number.isFinite(outstandingAmount) || outstandingAmount < 0) {
        return badRequest("outstanding_amount must be a non-negative number");
      }
      if (typeof dateOpened !== "string" || !dateOpened) {
        return badRequest("date_opened required");
      }
      if (!Number.isFinite(rate) || rate < RATE_MIN || rate > RATE_MAX) {
        return badRequest(`rate must be between ${RATE_MIN} and ${RATE_MAX}`);
      }
      if (
        !Number.isInteger(amortizationYears) ||
        amortizationYears < AMORTIZATION_MIN_YEARS ||
        amortizationYears > AMORTIZATION_MAX_YEARS
      ) {
        return badRequest(
          `amortization_years must be an integer between ${AMORTIZATION_MIN_YEARS} and ${AMORTIZATION_MAX_YEARS}`
        );
      }
      let paymentOverride: number | null | undefined;
      if (body.payment_override === undefined) {
        paymentOverride = undefined; // keep existing override untouched
      } else if (body.payment_override === null) {
        paymentOverride = null;
      } else {
        const parsed = Number(body.payment_override);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return badRequest("payment_override must be a non-negative number");
        }
        paymentOverride = parsed;
      }
      await repo.properties.setMortgage(propertyId, {
        outstanding_amount: outstandingAmount,
        date_opened: dateOpened,
        rate,
        amortization_years: amortizationYears,
        payment_override: paymentOverride,
      });
      return Response.json({ property: await repo.properties.get(propertyId) });
    }

    case "delete_mortgage": {
      const propertyId = Number(body.property_id);
      if (!Number.isFinite(propertyId)) return badRequest("property_id required");
      await repo.properties.deleteMortgage(propertyId);
      return Response.json({ property: await repo.properties.get(propertyId) });
    }

    case "add_expense": {
      const propertyId = Number(body.property_id);
      const label = body.label;
      const monthlyAmount = Number(body.monthly_amount);
      if (!Number.isFinite(propertyId)) return badRequest("property_id required");
      if (typeof label !== "string" || !label.trim()) return badRequest("label required");
      if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0) {
        return badRequest("monthly_amount must be a non-negative number");
      }
      const id = await repo.properties.addExpense(propertyId, {
        label: label.trim(),
        monthly_amount: monthlyAmount,
      });
      return Response.json({ id, property: await repo.properties.get(propertyId) });
    }

    case "update_expense": {
      const id = Number(body.id);
      const propertyId = Number(body.property_id);
      const label = body.label;
      const monthlyAmount = Number(body.monthly_amount);
      if (!Number.isFinite(id)) return badRequest("id required");
      if (!Number.isFinite(propertyId)) return badRequest("property_id required");
      if (typeof label !== "string" || !label.trim()) return badRequest("label required");
      if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0) {
        return badRequest("monthly_amount must be a non-negative number");
      }
      await repo.properties.updateExpense(id, { label: label.trim(), monthly_amount: monthlyAmount });
      return Response.json({ property: await repo.properties.get(propertyId) });
    }

    case "delete_expense": {
      const id = Number(body.id);
      const propertyId = Number(body.property_id);
      if (!Number.isFinite(id)) return badRequest("id required");
      if (!Number.isFinite(propertyId)) return badRequest("property_id required");
      await repo.properties.deleteExpense(id);
      return Response.json({ property: await repo.properties.get(propertyId) });
    }

    case "add_value_entry": {
      const propertyId = Number(body.property_id);
      const value = Number(body.value);
      const effectiveDate = body.effective_date;
      if (!Number.isFinite(propertyId)) return badRequest("property_id required");
      if (!Number.isFinite(value) || value < 0) {
        return badRequest("value must be a non-negative number");
      }
      if (typeof effectiveDate !== "string" || !effectiveDate) {
        return badRequest("effective_date required");
      }
      const id = await repo.properties.addValueEntry(propertyId, {
        value,
        effective_date: effectiveDate,
      });
      return Response.json({ id, property: await repo.properties.get(propertyId) });
    }

    case "delete_value_entry": {
      const id = Number(body.id);
      const propertyId = Number(body.property_id);
      if (!Number.isFinite(id)) return badRequest("id required");
      if (!Number.isFinite(propertyId)) return badRequest("property_id required");
      await repo.properties.deleteValueEntry(id);
      return Response.json({ property: await repo.properties.get(propertyId) });
    }

    default:
      return badRequest("Unknown action");
  }
}
