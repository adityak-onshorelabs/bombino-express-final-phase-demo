import { Plane, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { Shipment } from '@/lib/mockData';
import { StatusBadge } from './StatusBadge';
import { format } from 'date-fns';

interface ShipmentCardProps {
  shipment: Shipment;
}

export function ShipmentCard({ shipment }: ShipmentCardProps) {
  const [copied, setCopied] = useState(false);

  const copyAWB = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(shipment.awb);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Link
      href={`/shipment/${shipment.awb}`}
      className="block bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow animate-fade-in"
      data-testid={`card-shipment-${shipment.awb}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{shipment.awb}</span>
          <button
            onClick={copyAWB}
            className="p-1 rounded hover:bg-muted transition-colors"
            data-testid={`button-copy-${shipment.awb}`}
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <Copy className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </div>
        <StatusBadge status={shipment.status} />
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
        <span className="font-medium">{shipment.originCountry}</span>
        <Plane className="w-4 h-4 text-primary rotate-45" />
        <span className="font-medium">{shipment.destCountry}</span>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{format(shipment.createdAt, 'MMM d, yyyy')}</span>
        <span className="font-semibold text-foreground">
          ₹{shipment.priceEstimate.toLocaleString()}
        </span>
      </div>
    </Link>
  );
}