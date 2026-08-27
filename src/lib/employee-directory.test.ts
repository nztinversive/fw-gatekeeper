import { describe, expect, it } from 'vitest';
import { employeeDirectory, searchEmployeeDirectory } from './employee-directory';

describe('employee directory', () => {
  it('contains the supplied roster with unique employee IDs', () => {
    expect(employeeDirectory).toHaveLength(84);
    expect(new Set(employeeDirectory.map((employee) => employee.employeeId)).size).toBe(84);
  });

  it('searches aliases, IDs, departments, and multiple name terms', () => {
    expect(searchEmployeeDirectory('kevin').map((employee) => employee.employeeId)).toEqual(['F-36', 'F-88']);
    expect(searchEmployeeDirectory('F-2')[0]?.name).toBe('Alex Gonzalez');
    expect(searchEmployeeDirectory('jose station 11').map((employee) => employee.employeeId)).toContain('F-66');
  });

  it('prioritizes exact IDs over partial ID matches', () => {
    expect(searchEmployeeDirectory('F-1')[0]?.name).toBe('Steven Wheeler (D)');
  });
});
