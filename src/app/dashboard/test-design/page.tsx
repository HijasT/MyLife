"use client";

import { mylifeColors, mylifeSpacing, mylifeTypography } from '@/lib/mylife-design-tokens';

export default function TestDesignPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ 
        fontSize: mylifeTypography.fontSize['2xl'],
        fontWeight: mylifeTypography.fontWeight.bold,
        marginBottom: mylifeSpacing[6]
      }}>
        Design System Test
      </h1>

      {/* Test primary color */}
      <div style={{ 
        background: mylifeColors.primary,
        color: mylifeColors.onPrimary,
        padding: mylifeSpacing[4],
        borderRadius: '0.75rem',
        marginBottom: mylifeSpacing[4]
      }}>
        Primary Orange: {mylifeColors.primary}
      </div>

      {/* Test all module colors */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: mylifeSpacing[4] }}>
        {Object.entries(mylifeColors.modules).map(([name, color]) => (
          <div key={name} style={{
            background: color,
            color: 'white',
            padding: mylifeSpacing[4],
            borderRadius: '0.75rem',
            textAlign: 'center',
            fontWeight: mylifeTypography.fontWeight.semibold
          }}>
            {name}
          </div>
        ))}
      </div>

      {/* Test CSS variables */}
      <div style={{ marginTop: mylifeSpacing[8] }}>
        <button className="mylife-btn-primary">
          CSS Variable Button
        </button>
      </div>
    </div>
  );
}