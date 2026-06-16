'use client';

import Image from 'next/image';
import type { Embed } from '@/lib/messages/dto';
import { ExternalLink } from 'lucide-react';

interface EmbedCardProps {
  embed: Embed;
}

export function EmbedCard({ embed }: EmbedCardProps) {
  const { url, title, description, image, siteName } = embed;
  const displayTitle = title?.trim() || url;
  const displaySite = siteName?.trim();

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex max-w-[420px] overflow-hidden rounded-lg border border-border-primary bg-bg-quaternary transition-colors hover:border-green-primary/50 hover:bg-bg-tertiary"
    >
      {image && (
        <div className="relative flex-shrink-0 w-28 h-20 sm:w-32 sm:h-24 bg-bg-primary">
          <Image
            src={image}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 112px, 128px"
            unoptimized
          />
        </div>
      )}
      <div className="min-w-0 flex-1 p-3 flex flex-col justify-center">
        <div className="font-medium text-text-primary truncate flex items-center gap-1">
          <span className="truncate">{displayTitle}</span>
          <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" />
        </div>
        {displaySite && (
          <div className="text-xs text-text-muted mt-0.5">{displaySite}</div>
        )}
        {description?.trim() && (
          <div className="text-sm text-text-secondary line-clamp-2 mt-1">
            {description.trim()}
          </div>
        )}
      </div>
    </a>
  );
}
