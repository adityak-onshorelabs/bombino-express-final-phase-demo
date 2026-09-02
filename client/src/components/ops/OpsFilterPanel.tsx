import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { paymentMethodLabel } from '@/lib/orderDetail';
import {
  PAYMENT_METHODS,
  coerceDateRange,
  dateRangesForField,
  type OpsBoardFilters,
  type OpsCodFilter,
  type OpsDateField,
  type OpsFilterConfig,
  type OpsStageFilter,
} from '@/hooks/useOpsBoardFilters';

function Chip({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </Button>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function OpsFilterPanel({
  config,
  filters,
  setFilters,
  onClear,
  onDone,
}: {
  config: OpsFilterConfig;
  filters: OpsBoardFilters;
  setFilters: Dispatch<SetStateAction<OpsBoardFilters>>;
  onClear: () => void;
  onDone: () => void;
}) {
  const dateField = config.pickupDate === false ? 'booking' : filters.dateField;
  const showPickupToggle = config.dateRange && config.pickupDate !== false;
  const pickupNote = dateField === 'pickup' && filters.dateRange !== 'all';

  return (
    <div className="space-y-5" data-testid="ops-filter-panel">
      {config.assignment && (
        <Group label="Assignment">
          <Chip
            active={filters.assignment === 'all'}
            onClick={() => setFilters((f) => ({ ...f, assignment: 'all' }))}
            testId="ops-filter-assignment-all"
          >
            All
          </Chip>
          <Chip
            active={filters.assignment === 'assigned'}
            onClick={() => setFilters((f) => ({ ...f, assignment: 'assigned' }))}
            testId="ops-filter-assignment-assigned"
          >
            Assigned
          </Chip>
          <Chip
            active={filters.assignment === 'unassigned'}
            onClick={() => setFilters((f) => ({ ...f, assignment: 'unassigned' }))}
            testId="ops-filter-assignment-unassigned"
          >
            Unassigned
          </Chip>
        </Group>
      )}

      {config.stage && (
        <Group label="Stage">
          {(
            [
              ['all', 'All'],
              ['inbound', 'Inbound'],
              ['hub', 'Hub'],
              ['settled', 'Settled'],
            ] as const satisfies ReadonlyArray<readonly [OpsStageFilter, string]>
          ).map(([value, label]) => (
            <Chip
              key={value}
              active={filters.stage === value}
              onClick={() => setFilters((f) => ({ ...f, stage: value }))}
              testId={`ops-filter-stage-${value}`}
            >
              {label}
            </Chip>
          ))}
        </Group>
      )}

      {config.dateRange && (
        <div className="space-y-3">
          {showPickupToggle && (
            <Group label="Date">
              {(
                [
                  ['booking', 'Booking'],
                  ['pickup', 'Pickup'],
                ] as const satisfies ReadonlyArray<readonly [OpsDateField, string]>
              ).map(([value, label]) => (
                <Chip
                  key={value}
                  active={dateField === value}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      dateField: value,
                      dateRange: coerceDateRange(value, f.dateRange),
                    }))
                  }
                  testId={`ops-filter-date-field-${value}`}
                >
                  {label}
                </Chip>
              ))}
            </Group>
          )}
          <Group label={showPickupToggle ? 'Range' : 'Date'}>
            {dateRangesForField(dateField).map(({ value, label }) => (
              <Chip
                key={value}
                active={filters.dateRange === value}
                onClick={() => setFilters((f) => ({ ...f, dateRange: value }))}
                testId={`ops-filter-date-range-${value}`}
              >
                {label}
              </Chip>
            ))}
          </Group>
          {pickupNote && (
            <p className="text-xs text-muted-foreground" data-testid="ops-filter-pickup-note">
              Orders without a pickup date are hidden.
            </p>
          )}
        </div>
      )}

      {config.paymentMethod && (
        <Group label="Payment">
          <Chip
            active={filters.paymentMethod === 'all'}
            onClick={() => setFilters((f) => ({ ...f, paymentMethod: 'all' }))}
            testId="ops-filter-payment-all"
          >
            All
          </Chip>
          {PAYMENT_METHODS.map((method) => (
            <Chip
              key={method}
              active={filters.paymentMethod === method}
              onClick={() => setFilters((f) => ({ ...f, paymentMethod: method }))}
              testId={`ops-filter-payment-${method}`}
            >
              {paymentMethodLabel(method)}
            </Chip>
          ))}
        </Group>
      )}

      {config.cod && (
        <Group label="COD">
          {(
            [
              ['all', 'All'],
              ['cod', 'COD'],
            ] as const satisfies ReadonlyArray<readonly [OpsCodFilter, string]>
          ).map(([value, label]) => (
            <Chip
              key={value}
              active={filters.cod === value}
              onClick={() => setFilters((f) => ({ ...f, cod: value }))}
              testId={`ops-filter-cod-${value}`}
            >
              {label}
            </Chip>
          ))}
        </Group>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClear}
          data-testid="ops-filters-clear"
        >
          Clear
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onDone}
          data-testid="ops-filters-done"
        >
          Done
        </Button>
      </div>
    </div>
  );
}
