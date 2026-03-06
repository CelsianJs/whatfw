// ---------------------------------------------------------------------------
// Fake data generation — 10,000 rows of employee records
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank',
  'Ivy', 'Jack', 'Karen', 'Leo', 'Mona', 'Nick', 'Olivia', 'Paul',
  'Quinn', 'Rita', 'Sam', 'Tina', 'Uma', 'Vince', 'Wendy', 'Xander',
  'Yara', 'Zach', 'Aria', 'Blake', 'Cora', 'Derek', 'Elena', 'Felix',
  'Gina', 'Hugo', 'Iris', 'Joel', 'Kira', 'Liam', 'Maya', 'Noah',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
  'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark',
  'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King',
  'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
];

const DEPARTMENTS = [
  'Engineering', 'Design', 'Marketing', 'Sales', 'Finance',
  'Human Resources', 'Operations', 'Legal', 'Support', 'Product',
];

const STATUSES = ['Active', 'On Leave', 'Remote', 'Contractor'];

// Simple seeded pseudo-random for deterministic data
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateRows(count = 10000) {
  const rand = mulberry32(42);
  const rows = [];

  for (let i = 0; i < count; i++) {
    const first = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)];
    const name = `${first} ${last}`;
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`;
    const department = DEPARTMENTS[Math.floor(rand() * DEPARTMENTS.length)];
    const salary = Math.floor(rand() * 120000) + 40000;
    const status = STATUSES[Math.floor(rand() * STATUSES.length)];

    rows.push({ id: i + 1, name, email, department, salary, status });
  }

  return rows;
}
