import { Button } from '@affine/admin/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@affine/admin/components/ui/select';
import { cn } from '@affine/admin/utils';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { useState, useEffect } from 'react';
import { useQuery } from '../../use-query';
import { useMutation } from '../../use-mutation';
import { appConfigQuery, updateAppConfigMutation } from '@affine/graphql';
import { toast } from 'sonner';

import { Header } from '../header';

const studioActions = [
  { id: 'validate_contract', label: 'Valider Contrat' },
  { id: 'analyze_risks', label: 'Analyse des Risques' },
  { id: 'global_synthesis', label: 'Synthèse Globale' },
  { id: 'draft_clause', label: 'Rédiger Clause' },
  { id: 'irac_analysis', label: 'Analyse IRAC' },
];

const availableModels = [
  { id: 'gpt-4o', label: 'GPT-4o (Azure Cloud)' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo (Azure Cloud)' },
  { id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
  { id: 'qwen2', label: 'Qwen 2 (Local Privé)' },
  { id: 'mistral-nemo', label: 'Mistral Nemo (Local Privé)' },
];

function AiPage() {
  const { data, mutate } = useQuery({ query: appConfigQuery });
  const { trigger: updateConfig, isMutating } = useMutation({
    mutation: updateAppConfigMutation,
  });

  const [studioModel, setStudioModel] = useState<string>('gpt-4o');

  useEffect(() => {
    if (data?.appConfig?.copilot?.scenarios?.scenarios?.studio) {
      setStudioModel(data.appConfig.copilot.scenarios.scenarios.studio);
    }
  }, [data]);

  const handleSave = async () => {
    try {
      // Reconstruct the scenarios object to keep other settings
      const existingScenarios = data?.appConfig?.copilot?.scenarios || {};
      const newScenarios = {
        ...existingScenarios,
        override_enabled: true,
        scenarios: {
          ...(existingScenarios.scenarios || {}),
          studio: studioModel
        }
      };

      await updateConfig({
        updates: [
          {
            module: 'copilot',
            key: 'scenarios',
            value: newScenarios,
          },
        ],
      });
      toast('Modèle sauvegardé', { description: `Le modèle par défaut du Studio a été mis à jour à ${studioModel}.` });
      mutate(); // refresh data
    } catch (e: any) {
      toast('Erreur de sauvegarde', { description: e.message });
    }
  };

  return (
    <div className="h-dvh flex-1 flex-col flex">
      <Header title="AI" />
      <ScrollAreaPrimitive.Root
        className={cn('relative overflow-hidden w-full')}
      >
        <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] [&>div]:!block">
          <div className="p-6 max-w-3xl mx-auto">
            <div className="text-[20px] mb-8">Lexior IA & Studio</div>

            <div className="flex flex-col gap-6">
              <div className="border rounded-md p-6">
                <div className="text-lg font-semibold mb-2">Configuration Globale Lexior Studio</div>
                <p className="text-sm text-muted-foreground mb-6">
                  Choisissez le modèle d'intelligence artificielle à utiliser par défaut pour les actions d'analyse juridique complexes (Map-Reduce de dossiers).
                </p>

                <div className="flex items-center gap-4">
                  <Select value={studioModel} onValueChange={setStudioModel}>
                    <SelectTrigger className="w-[300px]">
                      <SelectValue placeholder="Sélectionner le modèle par défaut" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Button onClick={handleSave} disabled={isMutating}>
                    {isMutating ? 'Sauvegarde...' : 'Sauvegarder'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </ScrollAreaPrimitive.Viewport>
        <ScrollAreaPrimitive.ScrollAreaScrollbar
          className={cn(
            'flex touch-none select-none transition-colors',
            'h-full w-2.5 border-l border-l-transparent p-[1px]'
          )}
        >
          <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
        </ScrollAreaPrimitive.ScrollAreaScrollbar>
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
    </div>
  );
}

export { AiPage as Component };
