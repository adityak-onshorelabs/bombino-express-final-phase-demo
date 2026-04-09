import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SavedAddress {
  id: string;
  full_name: string;
  company: string | null;
  phone: string;
  address_line_1: string;
  city: string;
  state: string | null;
  pincode: string | null;
  type: string;
}

interface AddressPickerProps {
  type: 'sender' | 'recipient';
  onSelect: (address: SavedAddress) => void;
  isLoggedIn: boolean;
}

function truncateAddress(value: string): string {
  if (value.length <= 20) return value;
  return `${value.slice(0, 20)}...`;
}

export function AddressPicker({ type, onSelect, isLoggedIn }: AddressPickerProps) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      setAddresses([]);
      setSelectedId(null);
      return;
    }

    let isMounted = true;

    const loadAddresses = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/addresses?type=${type}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          if (isMounted) setAddresses([]);
          return;
        }

        const data = (await res.json()) as SavedAddress[];
        if (isMounted) {
          setAddresses(Array.isArray(data) ? data : []);
          setSelectedId(null);
        }
      } catch {
        if (isMounted) setAddresses([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadAddresses();

    return () => {
      isMounted = false;
    };
  }, [isLoggedIn, type]);

  if (!isLoggedIn || isLoading || addresses.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Saved Addresses</p>
      <div className="overflow-x-auto">
        <div className="flex gap-3 pb-1">
          {addresses.map((address) => {
            const isSelected = selectedId === address.id;
            return (
              <button
                key={address.id}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    setSelectedId(null);
                    return;
                  }
                  setSelectedId(address.id);
                  onSelect(address);
                }}
                className={cn(
                  'relative min-w-52 text-left bg-card rounded-xl border p-3 shadow-sm transition-colors',
                  isSelected ? 'border-primary' : 'border-border'
                )}
              >
                {isSelected && <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />}
                <p className="text-sm font-semibold text-foreground pr-6">{address.full_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{address.city}</p>
                <p className="mt-1 text-xs text-muted-foreground">{truncateAddress(address.address_line_1)}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
