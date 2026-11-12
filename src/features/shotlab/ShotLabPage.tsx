import { MonitorX, RotateCcw, ScanLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PublicLayout } from '../../app/PublicLayout';
import { Button, EmptyState, ErrorNotice, PageHeader } from '../../ui';
import { ProgressPanel } from './ProgressPanel';
import { LiveView } from './LiveView';
import { ResultView } from './ResultView';
import { StartPanel } from './StartPanel';
import { useShotLab } from './useShotLab';

/**
 * Shot lab: film one strike, see the kicker's movement as a skeleton over the clip and
 * in 3D, and read a few honest measurements around the moment of the strike. All of it
 * runs on this device; the video is never uploaded or stored.
 */
export function ShotLabPage() {
  const { t } = useTranslation();
  const lab = useShotLab();
  const { state } = lab;

  return (
    <PublicLayout>
      <PageHeader
        title={t('shotlab.title')}
        subtitle={t('shotlab.subtitle')}
        actions={
          state.phase === 'result' ? (
            <>
              {state.source === 'live' && (
                <Button variant="secondary" icon={<ScanLine />} onClick={lab.startLive}>
                  {t('shotlab.live.backToCamera')}
                </Button>
              )}
              <Button variant="secondary" icon={<RotateCcw />} onClick={lab.reset}>
                {t('shotlab.again')}
              </Button>
            </>
          ) : undefined
        }
      />
      {state.phase === 'start' && (
        <StartPanel onFile={lab.chooseFile} onExample={lab.showExample} onLive={lab.startLive} />
      )}
      {(state.phase === 'loading-model' || state.phase === 'analysing') && (
        <ProgressPanel
          phase={state.phase}
          done={state.phase === 'loading-model' ? state.loaded : state.done}
          total={state.total}
          videoUrl={lab.videoUrl}
          attachVideo={lab.attachVideo}
          onCancel={lab.cancel}
        />
      )}
      {state.phase === 'live' && (
        <LiveView getDetector={lab.getDetector} onSeeStrike={lab.showCaught} onBack={lab.reset} />
      )}
      {state.phase === 'result' && (
        <ResultView
          frames={state.frames}
          analysis={state.analysis}
          videoUrl={lab.videoUrl}
          source={state.source}
          truncated={state.truncated}
        />
      )}
      {state.phase === 'unsupported' && (
        <EmptyState
          icon={<MonitorX />}
          title={t('shotlab.unsupported.title')}
          body={t('shotlab.unsupported.body')}
          action={<Button onClick={lab.showExample}>{t('shotlab.start.example')}</Button>}
        />
      )}
      {state.phase === 'error' && (
        <div className="flex flex-col gap-4">
          <ErrorNotice
            title={t(`shotlab.error.${state.reason}.title`)}
            body={t(`shotlab.error.${state.reason}.body`)}
            onRetry={lab.reset}
          />
          <div>
            <Button variant="secondary" onClick={lab.showExample}>
              {t('shotlab.start.example')}
            </Button>
          </div>
        </div>
      )}
    </PublicLayout>
  );
}
