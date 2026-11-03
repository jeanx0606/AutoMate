<template>
  <div class="help-view">
    <header class="help-heading">
      <div>
        <p class="help-kicker">{{ $t('help.kicker') }}</p>
        <h2>{{ $t('help.title') }}</h2>
      </div>
      <p class="help-intro">{{ $t('help.intro') }}</p>
    </header>

    <section class="help-pros" aria-label="AutoMate">
      <div class="pros-grid">
        <div class="pros-item">
          <span class="pros-icon" aria-hidden="true">⚡</span>
          <strong>{{ $t('help.prosAutoLogin') }}</strong>
          <p>{{ $t('help.prosAutoLoginDesc') }}</p>
        </div>
        <div class="pros-item">
          <span class="pros-icon" aria-hidden="true">🔒</span>
          <strong>{{ $t('help.prosEncryption') }}</strong>
          <p>{{ $t('help.prosEncryptionDesc') }}</p>
        </div>
        <div class="pros-item">
          <span class="pros-icon" aria-hidden="true">🌐</span>
          <strong>{{ $t('help.prosDualCoverage') }}</strong>
          <p>{{ $t('help.prosDualCoverageDesc') }}</p>
        </div>
        <div class="pros-item">
          <span class="pros-icon" aria-hidden="true">🆓</span>
          <strong>{{ $t('help.prosOpenSource') }}</strong>
          <p>{{ $t('help.prosOpenSourceDesc') }}</p>
        </div>
      </div>
    </section>

    <section class="help-section" aria-labelledby="navigation-title">
      <h3 id="navigation-title">{{ $t('help.quickStartTitle') }}</h3>
      <details>
        <summary>{{ $t('help.howToStart') }}</summary>
        <p>{{ $t('help.howToStartAnswer') }}</p>
        <p>{{ $t('help.howToStartExample') }}</p>
      </details>
      <details>
        <summary>{{ $t('help.navPages') }}</summary>
        <p>{{ $t('help.navPagesAnswer1') }}</p>
        <p>{{ $t('help.navPagesAnswer2') }}</p>
      </details>
    </section>

    <section class="help-section" aria-labelledby="login-title">
      <h3 id="login-title">{{ $t('help.loginAutomationTitle') }}</h3>
      <details>
        <summary>{{ $t('help.howToSchedule') }}</summary>
        <p>{{ $t('help.howToScheduleAnswer') }}</p>
      </details>
      <details>
        <summary>{{ $t('help.howToAutoFill') }}</summary>
        <p>{{ $t('help.howToAutoFillAnswer') }}</p>
      </details>
      <details>
        <summary>{{ $t('help.howToUseSystems') }}</summary>
        <p>{{ $t('help.howToUseSystemsAnswer') }}</p>
      </details>
      <details>
        <summary>{{ $t('help.credentialsSafe') }}</summary>
        <p>{{ $t('help.credentialsSafeAnswer') }}</p>
      </details>
      <details>
        <summary>{{ $t('help.groupFunction') }}</summary>
        <p>{{ $t('help.groupFunctionAnswer') }}</p>
      </details>
      <details>
        <summary>{{ $t('help.noAuthSave') }}</summary>
        <p>{{ $t('help.noAuthSaveAnswer') }}</p>
      </details>
      <details>
        <summary>{{ $t('help.vsBrowserPassword') }}</summary>
        <p>{{ $t('help.vsBrowserPasswordAnswer') }}</p>
      </details>
      <details>
        <summary>{{ $t('help.whatToTryFirst') }}</summary>
        <p>{{ $t('help.whatToTryFirstAnswer') }}</p>
      </details>
    </section>

    <section class="help-section" aria-labelledby="extension-title">
      <h3 id="extension-title">{{ $t('help.extensionTitle') }}</h3>
      <details>
        <summary>{{ $t('help.howToConnectExt') }}</summary>
        <p>{{ $t('help.howToConnectExtAnswer') }}</p>
      </details>
      <details>
        <summary>{{ $t('help.howToAdaptForms') }}</summary>
        <p>{{ $t('help.howToAdaptFormsAnswer') }}</p>
      </details>
    </section>

    <section class="help-section" aria-labelledby="shortcuts-title">
      <h3 id="shortcuts-title">{{ $t('help.shortcutsTitle') }}</h3>
      <details>
        <summary>{{ $t('help.whatShortcuts') }}</summary>
        <p>{{ $t('help.whatShortcutsAnswer') }}</p>
      </details>
      <details>
        <summary>{{ $t('help.howToBackup') }}</summary>
        <p>{{ $t('help.howToBackupAnswer') }}</p>
      </details>
    </section>
  </div>
</template>

<style scoped>
.help-view { max-width: 880px; margin: 0 auto; display: grid; gap: 20px; }
.help-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--color-border); }
.help-kicker { margin-bottom: 4px; color: #6096ba; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; }
.help-heading h2 { font-size: 24px; color: var(--color-text); }
.help-intro { max-width: 440px; color: var(--text-secondary); font-size: 14px; line-height: 1.7; }
.help-pros { display: grid; gap: 8px; }
.pros-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.pros-item { padding: 14px 16px; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-surface); box-shadow: var(--shadow-sm); }
.pros-icon { display: inline-grid; place-items: center; width: 32px; height: 32px; margin-bottom: 8px; border-radius: 8px; background: var(--color-primary-light); font-size: 16px; }
.pros-item strong { display: block; margin-bottom: 4px; color: var(--color-text); font-size: 14.5px; }
.pros-item p { margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
.help-section { display: grid; gap: 10px; }
.help-section h3 { margin-bottom: 2px; color: var(--color-text); font-size: 16px; }
.help-section details { border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-surface); box-shadow: var(--shadow-sm); overflow: hidden; }
.help-section summary { padding: 13px 16px; color: var(--color-text); font-weight: 600; cursor: pointer; font-size: 15px; }
.help-section details[open] summary { border-bottom: 1px solid var(--color-border); background: var(--color-primary-light); }
.help-section details p { padding: 10px 16px 0; color: var(--text-secondary); font-size: 14px; line-height: 1.75; }
.help-section details p:last-child { padding-bottom: 14px; }
@media (max-width: 640px) {
  .help-heading { align-items: flex-start; flex-direction: column; gap: 8px; }
  .help-intro { max-width: none; }
}
</style>