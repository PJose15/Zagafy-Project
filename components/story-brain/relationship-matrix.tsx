'use client';

import { useTranslations } from 'next-intl';
import type { RelationshipPair } from '@/lib/story-brain/types';

interface RelationshipMatrixProps {
  relationships: RelationshipPair[];
}

export function RelationshipMatrix({ relationships }: RelationshipMatrixProps) {
  const t = useTranslations('storyBrain');
  if (relationships.length === 0) {
    return <p className="text-sm text-sepia-600 text-center py-8">{t('matrix.empty')}</p>;
  }

  // Collect unique character names
  const names = new Set<string>();
  for (const r of relationships) {
    names.add(r.sourceName);
    names.add(r.targetName);
  }
  const nameList = [...names].sort();

  // Build lookup
  const lookup = new Map<string, RelationshipPair>();
  for (const r of relationships) {
    lookup.set(`${r.sourceName}:${r.targetName}`, r);
    lookup.set(`${r.targetName}:${r.sourceName}`, r);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" role="grid" aria-label={t('matrix.ariaLabel')}>
        <thead>
          <tr>
            <th className="p-2 text-left text-sepia-600 font-medium" />
            {nameList.map(name => (
              <th key={name} className="p-2 text-center text-sepia-600 font-medium truncate max-w-[80px]">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nameList.map(rowName => (
            <tr key={rowName}>
              <td className="p-2 font-medium text-sepia-800 truncate max-w-[100px]">{rowName}</td>
              {nameList.map(colName => {
                if (rowName === colName) {
                  return <td key={colName} className="p-2 text-center text-sepia-300">—</td>;
                }
                const rel = lookup.get(`${rowName}:${colName}`);
                if (!rel) {
                  return <td key={colName} className="p-2 text-center text-sepia-300">·</td>;
                }
                return (
                  <td key={colName} className="p-2">
                    <div className="flex flex-col items-center gap-0.5" title={t('matrix.cellTitle', { trust: rel.trustLevel, tension: rel.tensionLevel })}>
                      <div
                        className="w-6 h-3 rounded-sm"
                        style={{
                          background: `linear-gradient(to right, ${trustColor(rel.trustLevel)}, ${tensionColor(rel.tensionLevel)})`,
                        }}
                      />
                      <span className="text-[8px] text-sepia-600">{rel.trustLevel}/{rel.tensionLevel}</span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function trustColor(level: number): string {
  if (level >= 70) return '#16a34a'; // green-600
  if (level >= 40) return '#ca8a04'; // yellow-600
  return '#dc2626'; // red-600
}

function tensionColor(level: number): string {
  if (level >= 70) return '#dc2626'; // red-600
  if (level >= 40) return '#ca8a04'; // yellow-600
  return '#16a34a'; // green-600
}
