import { prisma } from "@/lib/prisma";
import { calculateBalance, calculatePayroll } from "@/lib/payroll";

export type PayrollBreakdown = {
  employee_id: string;
  month: number;
  year: number;
  days_present: number;
  days_absent: number;
  days_half: number;
  paid_leave_days: number;
  payable_days: number;
  base_pay: number;
  overtime_total_units: number;
  overtime_rate_snapshot: number;
  overtime_pay: number;
  total_pay: number;
  salary_given: number;
  previous_balance: number;
  monthly_balance: number;
  closing_balance: number;
  generated_at: Date;
};

type EmployeeWithOutlet = {
  id: string;
  monthly_salary: { toString(): string };
  paid_leave_days: number;
  outlet: { overtime_rate: { toString(): string } };
};

type AttendanceRow = {
  employee_id: string;
  status: string;
  overtime_units: unknown;
};

type PaymentRow = {
  employee_id: string;
  amount: unknown;
};

type SummaryRow = {
  employee_id: string;
  closing_balance: unknown;
  generated_at: Date;
};

function prevMonthYear(month: number, year: number) {
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  return { prevMonth, prevYear };
}

function monthRange(year: number, month: number) {
  return {
    startDate: new Date(year, month - 1, 1),
    endDate: new Date(year, month, 0, 23, 59, 59),
  };
}

export function buildPayrollBreakdown(
  employee: EmployeeWithOutlet,
  month: number,
  year: number,
  attendance: AttendanceRow[],
  payments: PaymentRow[],
  prevSummary: SummaryRow | undefined,
  existingSummary: SummaryRow | undefined
): PayrollBreakdown {
  const days_present = attendance.filter((r) => r.status === "present").length;
  const days_absent = attendance.filter((r) => r.status === "absent").length;
  const days_half = attendance.filter((r) => r.status === "half").length;
  const overtime_total_units = attendance.reduce(
    (sum, r) => sum + (r.overtime_units ? Number(r.overtime_units) : 0),
    0
  );
  const salary_given = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const previous_balance = prevSummary ? Number(prevSummary.closing_balance) : 0;

  const { base_pay, overtime_pay, total_pay, payable_days } = calculatePayroll({
    monthly_salary: employee.monthly_salary,
    paid_leave_days: employee.paid_leave_days,
    days_absent,
    days_half,
    overtime_total_units,
    overtime_rate: employee.outlet.overtime_rate,
  });

  const { monthly_balance, closing_balance } = calculateBalance(
    total_pay,
    salary_given,
    previous_balance
  );

  return {
    employee_id: employee.id,
    month,
    year,
    days_present,
    days_absent,
    days_half,
    paid_leave_days: employee.paid_leave_days,
    payable_days,
    base_pay,
    overtime_total_units,
    overtime_rate_snapshot: Number(employee.outlet.overtime_rate),
    overtime_pay,
    total_pay,
    salary_given,
    previous_balance,
    monthly_balance,
    closing_balance,
    generated_at: existingSummary?.generated_at ?? new Date(),
  };
}

export async function computeOutletPayroll(outletId: string, orgId: string, month: number, year: number) {
  const { startDate, endDate } = monthRange(year, month);
  const { prevMonth, prevYear } = prevMonthYear(month, year);

  const [outlet, employees] = await Promise.all([
    prisma.outlet.findFirst({
      where: { id: outletId, org_id: orgId },
      select: { id: true, overtime_rate: true },
    }),
    prisma.employee.findMany({
      where: { outlet_id: outletId, outlet: { org_id: orgId } },
      select: {
        id: true,
        name: true,
        monthly_salary: true,
        paid_leave_days: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!outlet) return null;

  if (employees.length === 0) {
    return { employees: [], payroll: {} as Record<string, PayrollBreakdown> };
  }

  const employeeIds = employees.map((e) => e.id);

  const [attendance, payments, summaries, prevSummaries] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { employee_id: { in: employeeIds }, date: { gte: startDate, lte: endDate } },
      select: { employee_id: true, status: true, overtime_units: true },
    }),
    prisma.salaryPayment.findMany({
      where: { employee_id: { in: employeeIds }, month, year },
      select: { employee_id: true, amount: true },
    }),
    prisma.payrollSummary.findMany({
      where: { employee_id: { in: employeeIds }, month, year },
      select: { employee_id: true, closing_balance: true, generated_at: true },
    }),
    prisma.payrollSummary.findMany({
      where: { employee_id: { in: employeeIds }, month: prevMonth, year: prevYear },
      select: { employee_id: true, closing_balance: true, generated_at: true },
    }),
  ]);

  const attendanceByEmployee = groupBy(attendance, (r) => r.employee_id);
  const paymentsByEmployee = groupBy(payments, (r) => r.employee_id);
  const summaryByEmployee = new Map(summaries.map((s) => [s.employee_id, s]));
  const prevSummaryByEmployee = new Map(prevSummaries.map((s) => [s.employee_id, s]));
  const outletRate = { overtime_rate: outlet.overtime_rate };

  const payroll: Record<string, PayrollBreakdown> = {};
  for (const employee of employees) {
    payroll[employee.id] = buildPayrollBreakdown(
      { ...employee, outlet: outletRate },
      month,
      year,
      attendanceByEmployee.get(employee.id) ?? [],
      paymentsByEmployee.get(employee.id) ?? [],
      prevSummaryByEmployee.get(employee.id),
      summaryByEmployee.get(employee.id)
    );
  }

  return { employees, payroll };
}

export async function computeEmployeePayroll(
  employeeId: string,
  orgId: string,
  month: number,
  year: number
) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, outlet: { org_id: orgId } },
    include: {
      outlet: { select: { name: true, overtime_rate: true, overtime_unit: true } },
    },
  });
  if (!employee) return null;

  const { startDate, endDate } = monthRange(year, month);
  const { prevMonth, prevYear } = prevMonthYear(month, year);

  const [attendance, payments, existing, prevSummary] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { employee_id: employeeId, date: { gte: startDate, lte: endDate } },
      select: { employee_id: true, status: true, overtime_units: true },
    }),
    prisma.salaryPayment.findMany({
      where: { employee_id: employeeId, month, year },
      select: { employee_id: true, amount: true },
    }),
    prisma.payrollSummary.findUnique({
      where: { employee_id_month_year: { employee_id: employeeId, month, year } },
      select: { employee_id: true, closing_balance: true, generated_at: true },
    }),
    prisma.payrollSummary.findUnique({
      where: { employee_id_month_year: { employee_id: employeeId, month: prevMonth, year: prevYear } },
      select: { employee_id: true, closing_balance: true, generated_at: true },
    }),
  ]);

  return {
    employee,
    payroll: buildPayrollBreakdown(
      employee,
      month,
      year,
      attendance,
      payments,
      prevSummary ?? undefined,
      existing ?? undefined
    ),
  };
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}
