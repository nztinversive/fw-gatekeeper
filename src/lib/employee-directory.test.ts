import { describe, expect, it } from 'vitest';
import { employeeDirectory, filterEmployeeDirectory, reconcileEmployeeDirectory, searchEmployeeDirectory } from './employee-directory';

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

  it('finds likely misspellings so operators can avoid duplicate people', () => {
    expect(searchEmployeeDirectory('Alex Gonzales')[0]?.employeeId).toBe('F-2');
  });

  it('reconciles roster progress by employee ID before falling back to name', () => {
    const result = reconcileEmployeeDirectory([
      { id: 'worker-1', name: 'Different Display Name', employeeId: 'f-2', encodingStatus: 'valid' },
      { id: 'worker-2', name: 'Amanda Bonapace', encodingStatus: 'invalid' },
    ]);

    expect(result.employees.find((employee) => employee.employeeId === 'F-2')).toMatchObject({ status: 'enrolled', workerId: 'worker-1' });
    expect(result.employees.find((employee) => employee.employeeId === 'S-1')).toMatchObject({ status: 'invalid', workerId: 'worker-2' });
    expect(result.summary).toEqual({ total: 84, enrolled: 1, remaining: 83, invalid: 1 });
  });

  it('preserves relevance ranking before limiting reconciled suggestions', () => {
    const { employees } = reconcileEmployeeDirectory([]);
    const suggestions = filterEmployeeDirectory(employees, 'F-1', 'all');

    expect(suggestions[0]).toMatchObject({ employeeId: 'F-1', name: 'Steven Wheeler (D)' });
    expect(suggestions).toHaveLength(12);
  });

  it('reserves employee-ID matches before name fallback so one worker cannot fill two roster rows', () => {
    const result = reconcileEmployeeDirectory([
      { id: 'worker-1', name: 'Amanda Bonapace', employeeId: 'F-2', encodingStatus: 'valid' },
    ]);

    expect(result.employees.find((employee) => employee.employeeId === 'F-2')).toMatchObject({
      status: 'enrolled',
      workerId: 'worker-1',
    });
    expect(result.employees.find((employee) => employee.employeeId === 'S-1')).toMatchObject({
      status: 'not_enrolled',
    });
    expect(result.employees.find((employee) => employee.employeeId === 'S-1')).not.toHaveProperty('workerId');
    expect(result.summary.enrolled).toBe(1);
  });
});
