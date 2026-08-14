type Decimal = number | { toString(): string };

export interface PayrollInput {
  monthly_salary: Decimal | number;
  paid_leave_days: number;
  days_absent: number;
  days_half?: number;
  overtime_total_units: Decimal | number;
  overtime_rate: Decimal | number;
}

export interface PayrollResult {
  daily_rate: number;
  payable_days: number;
  base_pay: number;
  overtime_pay: number;
  total_pay: number;
}

/**
 * Calculate payroll:
 *
 *   daily_rate   = monthly_salary / 30
 *   payable_days = 30 - days_absent - (0.5 × days_half) + paid_leave_days
 *   base_pay     = daily_rate * payable_days
 *   overtime_pay = (OT days) × overtime_rate   // rate is per employee (Settings)
 *   total_pay    = base_pay + overtime_pay
 *
 * Always uses 30 as the divisor regardless of actual calendar month length.
 * Closing balance carries forward via calculateBalance().
 *
 * OT on the calendar is on/off only (no amount typed on the day).
 * overtime_total_units = number of days marked OT.
 * overtime_rate comes from Employee.overtime_rate (Settings).
 */
export function calculatePayroll(input: PayrollInput): PayrollResult {
  const salary = Number(input.monthly_salary);
  const paidLeave = Number(input.paid_leave_days);
  const absent = Number(input.days_absent);
  const half = Number(input.days_half ?? 0);
  const otUnits = Number(input.overtime_total_units);
  const otRate = Number(input.overtime_rate);

  const daily_rate = salary / 30;
  const payable_days = 30 - absent - 0.5 * half + paidLeave;
  const base_pay = roundRupee(daily_rate * payable_days);
  const overtime_pay = roundRupee(otUnits * otRate);
  const total_pay = roundRupee(base_pay + overtime_pay);

  return {
    daily_rate: roundRupee(daily_rate),
    payable_days,
    base_pay,
    overtime_pay,
    total_pay,
  };
}

/**
 * Calculate the closing balance for a month.
 *
 *   monthly_balance = total_pay - salary_given
 *   closing_balance = previous_balance + monthly_balance
 *
 * All money values are rounded to the nearest rupee (22.3 → 22, 22.5 → 23).
 */
export function calculateBalance(
  total_pay: number,
  salary_given: number,
  previous_balance: number
) {
  const monthly_balance = roundRupee(roundRupee(total_pay) - roundRupee(salary_given));
  const closing_balance = roundRupee(roundRupee(previous_balance) + monthly_balance);
  return { monthly_balance, closing_balance };
}

export function roundRupee(n: number): number {
  return Math.round(Number(n) || 0);
}

/**
 * Format a number as Indian Rupee currency string (whole rupees).
 */
export function formatINR(amount: number): string {
  const rounded = roundRupee(amount);
  const abs = Math.abs(rounded);
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs);
  return rounded < 0 ? `-${formatted}` : formatted;
}
