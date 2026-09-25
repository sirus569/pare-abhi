import { NextRequest } from "next/server";
import { getScopedRepo, unauthorized } from "@/lib/repo/scoped";
import { validateMortgageInput, type PropertyType } from "@/lib/db/properties";

// Properties (address, mortgage, expenses, rental income). Single
// action-discriminated route, same convention as /api/recurring and
// /api/categories — a full CRUD surface for four sub-resources doesn't get
// its own nested dynamic route in this codebase, it gets an `action` field.

const PROPERTY_TYPES: PropertyType[] = ["primary", "rental", "vacation", "other"];

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

function notFound(error: string) {
  return Response.json({ error }, { status: 404 });
}

// repo.properties.setMortgage/updateExpense/deleteExpense/deleteValueEntry
// throw on invalid input or a (propertyId, id) pair that doesn't match a real
// row — that's the source-of-truth validation (lib/db/properties.ts), not
// just this route's job. Convert it to an HTTP response instead of a 500.
async function runOrRespondError<T>(fn: () => Promise<T>): Promise<T | Response> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return message.includes("not found") ? notFound(message) : badRequest(message);
  }
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
      const mortgageError = validateMortgageInput(rate, amortizationYears);
      if (mortgageError) return badRequest(mortgageError);
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
      const setResult = await runOrRespondError(() =>
        repo.properties.setMortgage(propertyId, {
          outstanding_amount: outstandingAmount,
          date_opened: dateOpened,
          rate,
          amortization_years: amortizationYears,
          payment_override: paymentOverride,
        })
      );
      if (setResult instanceof Response) return setResult;
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
      const updateResult = await runOrRespondError(() =>
        repo.properties.updateExpense(propertyId, id, { label: label.trim(), monthly_amount: monthlyAmount })
      );
      if (updateResult instanceof Response) return updateResult;
      return Response.json({ property: await repo.properties.get(propertyId) });
    }

    case "delete_expense": {
      const id = Number(body.id);
      const propertyId = Number(body.property_id);
      if (!Number.isFinite(id)) return badRequest("id required");
      if (!Number.isFinite(propertyId)) return badRequest("property_id required");
      const deleteResult = await runOrRespondError(() => repo.properties.deleteExpense(propertyId, id));
      if (deleteResult instanceof Response) return deleteResult;
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
      const deleteResult = await runOrRespondError(() => repo.properties.deleteValueEntry(propertyId, id));
      if (deleteResult instanceof Response) return deleteResult;
      return Response.json({ property: await repo.properties.get(propertyId) });
    }

    default:
      return badRequest("Unknown action");
  }
}
