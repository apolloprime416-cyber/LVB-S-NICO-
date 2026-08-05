import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';

export function Logo({ className = "", iconClassName = "" }: { className?: string, iconClassName?: string }) {
  const [error, setError] = useState(false);
  const src = `${import.meta.env.BASE_URL}brand/logo.png`;

  if (error) {
    return (
      <div className={`flex items-center justify-center rounded-md bg-primary/10 border border-primary/20 ${className}`}>
        <ShieldAlert className={`text-primary ${iconClassName}`} />
      </div>
    );
  }

  return (
    <img 
      src={src} 
      alt="LVB Sônico" 
      className={`object-contain ${className}`}
      onError={() => setError(true)}
    />
  );
}
