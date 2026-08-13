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
 *   overtime_pay = overtime_total_units * overtime_rate
 *   total_pay    = base_pay + overtime_pay
 *
 * Always uses 30 as the divisor regardless of actual calendar month length.
 * Closing balance carries forward via calculateBalance().
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
  const base_pay = round2(daily_rate * payable_days);
  const overtime_pay = round2(otUnits * otRate);
  const total_pay = round2(base_pay + overtime_pay);

  return {
    daily_rate: round2(daily_rate),
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
 */
export function calculateBalance(
  total_pay: number,
  salary_given: number,
  previous_balance: number
) {
  const monthly_balance = round2(total_pay - salary_given);
  const closing_balance = round2(previous_balance + monthly_balance);
  return { monthly_balance, closing_balance };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Format a number as Indian Rupee currency string.
 */
export function formatINR(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(abs);
  return amount < 0 ? `-${formatted}` : formatted;
}
