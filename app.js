// ============================================================
// PCI APP – app.js
// ESE Hospital Regional Noroccidental
// Resolución 3280 de 2018 · Ciclos Vitales
// ============================================================

'use strict';

// ─── CONFIGURACIÓN ───────────────────────────────────────────
const GAS_URL = 'https://script.google.com/macros/s/AKfycbz-WHjRvYighjrOWgWcF5BJLBXHZsE_Jmx8owlhND6Tn9NRNSTa7XSPTfDPmxcUlyeW/exec'; // ← Reemplazar
const STORAGE_KEY = 'pci_pendientes';

// ─── SERVICE WORKER ──────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => console.log('[SW] Registrado:', reg.scope))
      .catch(err => console.error('[SW] Error:', err));
  });
}

// ─── DATOS DE INTERVENCIONES POR CICLO VITAL ─────────────────
// Basado en Anexos 23-29 (Resolución 3280/2018)
// Formato: { id, label, profesional, color }
// profesional: 'med' | 'enf' | 'psi' | 'odo' | 'nut' | 'aux'

const INTERVENCIONES = {

  primera_infancia: [
    // Medicina General
    { id: 'pi_consulta_control',         label: 'Consulta de Control de Programa',                                       profesional: 'med' },
    { id: 'pi_vacunacion',               label: 'Vacunación',                                                             profesional: 'med' },
    { id: 'pi_desparasitacion',          label: 'Desparasitación',                                                        profesional: 'med' },
    // Odontología
    { id: 'pi_consulta_odontologia',     label: 'Consulta por Odontología',                                               profesional: 'odo' },
    { id: 'pi_barniz_fluor',             label: 'Aplicación de Barniz Fluor',                                             profesional: 'odo' },
    { id: 'pi_profilaxis',               label: 'Profilaxis y remoción de placa (2 veces al año)',                        profesional: 'odo' },
    // Psicología
    { id: 'pi_tamizaje_salud_mental',    label: 'Tamizaje en Salud Mental (RQC)',                                         profesional: 'psi' },
    // Enfermería / Auxiliares
    { id: 'pi_lactancia_materna',        label: 'Promoción y apoyo a Lactancia Materna',                                  profesional: 'enf' },
    { id: 'pi_tamizaje_hemoglobina',     label: 'Tamizaje de Hemoglobina (Según Riesgo)',                                 profesional: 'enf' },
    { id: 'pi_micronutrientes_polvo',    label: 'Fortificación casera de Micronutrientes en Polvo',                       profesional: 'enf' },
    { id: 'pi_suplementacion_micro',     label: 'Suplementación con Micronutrientes (a partir de los 2 años, 2 veces/año)', profesional: 'enf' },
    { id: 'pi_suplementacion_hierro',    label: 'Suplementación con hierro (niños con bajo peso al nacer o delgadez durante lactancia)', profesional: 'enf' },
    // Psicología (riesgo)
    { id: 'pi_atencion_psicologia',      label: 'Atención por Psicología (de acuerdo al riesgo)',                         profesional: 'psi' },
    // Nutrición (riesgo)
    { id: 'pi_atencion_nutricion',       label: 'Atención por Nutrición (de acuerdo al riesgo)',                          profesional: 'nut' },
    // Educación
    { id: 'pi_edu_med',                  label: 'Educación individual Medicina General',                                  profesional: 'med' },
    { id: 'pi_edu_psi',                  label: 'Educación individual Psicología',                                        profesional: 'psi' },
    { id: 'pi_edu_enf',                  label: 'Educación individual Enfermería',                                        profesional: 'enf' },
    { id: 'pi_edu_odo',                  label: 'Educación individual Odontología',                                       profesional: 'odo' },
    { id: 'pi_edu_nut',                  label: 'Educación individual Nutrición',                                         profesional: 'nut' },
  ],

  infancia: [
    { id: 'inf_consulta_control',        label: 'Consulta de Control de Programa',                                        profesional: 'med' },
    { id: 'inf_vacunacion',              label: 'Vacunación',                                                             profesional: 'aux' },
    { id: 'inf_desparasitacion',         label: 'Desparasitación',                                                        profesional: 'aux' },
    { id: 'inf_consulta_odontologia',    label: 'Consulta por Odontología',                                               profesional: 'odo' },
    { id: 'inf_barniz_fluor',            label: 'Aplicación de Barniz Fluor',                                             profesional: 'odo' },
    { id: 'inf_profilaxis',              label: 'Profilaxis y remoción de placa (2 veces al año)',                        profesional: 'odo' },
    { id: 'inf_tamizaje_salud_mental',   label: 'Tamizaje en Salud Mental (RQC)',                                         profesional: 'psi' },
    { id: 'inf_tamizaje_hemoglobina',    label: 'Tamizaje de Hemoglobina (Según Riesgo)',                                 profesional: 'enf' },
    { id: 'inf_atencion_psicologia',     label: 'Atención por Psicología (de acuerdo al riesgo)',                         profesional: 'psi' },
    { id: 'inf_atencion_nutricion',      label: 'Atención por Nutrición (de acuerdo al riesgo)',                          profesional: 'nut' },
    { id: 'inf_edu_med',                 label: 'Educación individual Medicina General',                                  profesional: 'med' },
    { id: 'inf_edu_psi',                 label: 'Educación individual Psicología',                                        profesional: 'psi' },
    { id: 'inf_edu_enf',                 label: 'Educación individual Enfermería',                                        profesional: 'enf' },
    { id: 'inf_edu_odo',                 label: 'Educación individual Odontología',                                       profesional: 'odo' },
    { id: 'inf_edu_nut',                 label: 'Educación individual Nutrición',                                         profesional: 'nut' },
  ],

  adolescencia: [
    { id: 'ado_consulta_control',        label: 'Consulta de Control de Programa',                                        profesional: 'med' },
    { id: 'ado_vacunacion',              label: 'Vacunación',                                                             profesional: 'aux' },
    { id: 'ado_desparasitacion',         label: 'Desparasitación',                                                        profesional: 'aux' },
    { id: 'ado_consulta_odontologia',    label: 'Consulta por Odontología',                                               profesional: 'odo' },
    { id: 'ado_barniz_fluor',            label: 'Aplicación de Barniz Fluor',                                             profesional: 'odo' },
    { id: 'ado_profilaxis',              label: 'Profilaxis y remoción de placa (2 veces al año)',                        profesional: 'odo' },
    { id: 'ado_tamizaje_salud_mental',   label: 'Tamizaje en Salud Mental (SRQ)',                                         profesional: 'psi' },
    { id: 'ado_tamizaje_hemoglobina',    label: 'Tamizaje de Hemoglobina (Según Riesgo)',                                 profesional: 'enf' },
    { id: 'ado_atencion_psicologia',     label: 'Atención por Psicología (de acuerdo al riesgo)',                         profesional: 'psi' },
    { id: 'ado_atencion_nutricion',      label: 'Atención por Nutrición (de acuerdo al riesgo)',                          profesional: 'nut' },
    { id: 'ado_suministro_preservativos',label: 'Suministro de preservativos',                                            profesional: 'enf' },
    { id: 'ado_edu_med',                 label: 'Educación individual Medicina General',                                  profesional: 'med' },
    { id: 'ado_edu_psi',                 label: 'Educación individual Psicología',                                        profesional: 'psi' },
    { id: 'ado_edu_enf',                 label: 'Educación individual Enfermería',                                        profesional: 'enf' },
    { id: 'ado_edu_odo',                 label: 'Educación individual Odontología',                                       profesional: 'odo' },
    { id: 'ado_edu_nut',                 label: 'Educación individual Nutrición',                                         profesional: 'nut' },
  ],

  juventud: [
    { id: 'juv_consulta_med',            label: 'Consulta Medicina General',                                              profesional: 'med' },
    { id: 'juv_tamizaje_salud_mental',   label: 'Tamizaje en Salud Mental (SRQ)',                                         profesional: 'psi' },
    { id: 'juv_consulta_odontologia',    label: 'Atención Odontología (1 vez cada 2 años)',                               profesional: 'odo' },
    { id: 'juv_profilaxis',              label: 'Profilaxis y remoción de placa (1 vez al año)',                          profesional: 'odo' },
    { id: 'juv_tamizaje_cardiovascular', label: 'Tamizaje riesgo cardiovascular: glicemia, perfil lipídico, creatinina, uroanálisis (Según clasificación del riesgo)', profesional: 'med' },
    { id: 'juv_prueba_treponem',         label: 'Prueba rápida treponémica (Según exposición a riesgo)',                  profesional: 'enf' },
    { id: 'juv_prueba_vih',              label: 'Prueba rápida VIH (Según exposición a riesgo)',                          profesional: 'enf' },
    { id: 'juv_asesoria_vih',            label: 'Asesoría Pre y Post VIH (Según exposición a riesgo)',                   profesional: 'enf' },
    { id: 'juv_prueba_hb',               label: 'Prueba Rápida HB (Según exposición a riesgo)',                          profesional: 'enf' },
    { id: 'juv_prueba_hc',               label: 'Prueba Rápida HC (Según exposición a riesgo)',                          profesional: 'enf' },
    { id: 'juv_prueba_embarazo',         label: 'Prueba de embarazo (Según exposición a riesgo)',                         profesional: 'enf' },
    { id: 'juv_citologia',               label: 'Citología',                                                              profesional: 'med' },
    { id: 'juv_colposcopia',             label: 'Colposcopia',                                                            profesional: 'med' },
    { id: 'juv_biopsia_cervico',         label: 'Biopsia cervicouterina',                                                 profesional: 'med' },
    { id: 'juv_vacunacion',              label: 'Vacunación',                                                             profesional: 'aux' },
    { id: 'juv_atencion_psicologia',     label: 'Atención por Psicología (de acuerdo al riesgo)',                         profesional: 'psi' },
    { id: 'juv_atencion_nutricion',      label: 'Atención por Nutrición (de acuerdo al riesgo)',                          profesional: 'nut' },
    { id: 'juv_suministro_preservativos',label: 'Suministro de preservativos',                                            profesional: 'enf' },
    { id: 'juv_edu_ind',                 label: 'Educación individual',                                                   profesional: 'med' },
    { id: 'juv_edu_med',                 label: 'Educación individual Medicina General',                                  profesional: 'med' },
    { id: 'juv_edu_psi',                 label: 'Educación individual Psicología',                                        profesional: 'psi' },
    { id: 'juv_edu_enf',                 label: 'Educación individual Enfermería',                                        profesional: 'enf' },
    { id: 'juv_edu_odo',                 label: 'Educación individual Odontología',                                       profesional: 'odo' },
    { id: 'juv_edu_nut',                 label: 'Educación individual Nutrición',                                         profesional: 'nut' },
  ],

  adultez: [
    { id: 'adu_consulta_med',            label: 'Consulta Medicina General',                                              profesional: 'med' },
    { id: 'adu_tamizaje_salud_mental',   label: 'Tamizaje en Salud Mental (SRQ)',                                         profesional: 'psi' },
    { id: 'adu_consulta_odontologia',    label: 'Atención Odontología (1 vez cada 2 años)',                               profesional: 'odo' },
    { id: 'adu_profilaxis',              label: 'Profilaxis y remoción de placa (1 vez cada 2 años)',                     profesional: 'odo' },
    { id: 'adu_tamizaje_cardiovascular', label: 'Tamizaje riesgo cardiovascular: glicemia, perfil lipídico, creatinina, uroanálisis (Cada 5 años)', profesional: 'med' },
    { id: 'adu_prueba_treponem',         label: 'Prueba rápida treponémica (Según exposición a riesgo)',                  profesional: 'enf' },
    { id: 'adu_prueba_vih',              label: 'Prueba rápida VIH (Según exposición a riesgo)',                          profesional: 'enf' },
    { id: 'adu_asesoria_vih',            label: 'Asesoría Pre y Post VIH (Según exposición a riesgo)',                   profesional: 'enf' },
    { id: 'adu_prueba_hb',               label: 'Prueba Rápida HB (Según exposición a riesgo)',                          profesional: 'enf' },
    { id: 'adu_prueba_hc',               label: 'Prueba Rápida HC (Según exposición a riesgo)',                          profesional: 'enf' },
    { id: 'adu_prueba_embarazo',         label: 'Prueba de embarazo (Según exposición a riesgo)',                         profesional: 'enf' },
    { id: 'adu_citologia',               label: 'Citología',                                                              profesional: 'med' },
    { id: 'adu_adn_vph',                 label: 'ADN – VPH',                                                             profesional: 'med' },
    { id: 'adu_colposcopia',             label: 'Colposcopia',                                                            profesional: 'med' },
    { id: 'adu_biopsia_cervico',         label: 'Biopsia cervicouterina',                                                 profesional: 'med' },
    { id: 'adu_valoracion_mama',         label: 'Valoración clínica de Mama (Anual)',                                     profesional: 'med' },
    { id: 'adu_mamografia',              label: 'Mamografía (Cada dos años)',                                             profesional: 'med' },
    { id: 'adu_tamizaje_psa',            label: 'Tamizaje CA Próstata PSA (Cada 5 años)',                                 profesional: 'med' },
    { id: 'adu_tamizaje_tacto',          label: 'Tamizaje CA Próstata Tacto (Cada 5 años)',                               profesional: 'med' },
    { id: 'adu_biopsia_prostata',        label: 'Biopsia de próstata (Según hallazgo)',                                   profesional: 'med' },
    { id: 'adu_tamizaje_colon',          label: 'Tamizaje CA Colon, sangre oculta (Cada 2 años)',                        profesional: 'med' },
    { id: 'adu_colonoscopia',            label: 'Colonoscopia y biopsia (Según hallazgo)',                                profesional: 'med' },
    { id: 'adu_atencion_psicologia',     label: 'Atención por Psicología (de acuerdo al riesgo)',                         profesional: 'psi' },
    { id: 'adu_atencion_nutricion',      label: 'Atención por Nutrición (de acuerdo al riesgo)',                          profesional: 'nut' },
    { id: 'adu_suministro_preservativos',label: 'Suministro de preservativos',                                            profesional: 'enf' },
    { id: 'adu_vacunacion',              label: 'Vacunación',                                                             profesional: 'aux' },
    { id: 'adu_edu_psi',                 label: 'Educación individual Psicología',                                        profesional: 'psi' },
    { id: 'adu_edu_med',                 label: 'Educación individual Medicina General',                                  profesional: 'med' },
    { id: 'adu_edu_odo',                 label: 'Educación individual Odontología',                                       profesional: 'odo' },
    { id: 'adu_edu_nut',                 label: 'Educación individual Nutrición',                                         profesional: 'nut' },
  ],

  vejez: [
    { id: 'vej_consulta_med',            label: 'Consulta Medicina General',                                              profesional: 'med' },
    { id: 'vej_tamizaje_salud_mental',   label: 'Tamizaje en Salud Mental (SRQ)',                                         profesional: 'psi' },
    { id: 'vej_consulta_odontologia',    label: 'Atención Odontología (1 vez cada 2 años)',                               profesional: 'odo' },
    { id: 'vej_profilaxis',              label: 'Profilaxis y remoción de placa (1 vez cada 2 años)',                     profesional: 'odo' },
    { id: 'vej_tamizaje_cardiovascular', label: 'Tamizaje riesgo cardiovascular: glicemia, perfil lipídico, creatinina, uroanálisis (Cada 5 años)', profesional: 'med' },
    { id: 'vej_prueba_treponem',         label: 'Prueba rápida treponémica (Según exposición a riesgo)',                  profesional: 'enf' },
    { id: 'vej_prueba_vih',              label: 'Prueba rápida VIH (Según exposición a riesgo)',                          profesional: 'enf' },
    { id: 'vej_asesoria_vih',            label: 'Asesoría Pre y Post VIH (Según exposición a riesgo)',                   profesional: 'enf' },
    { id: 'vej_prueba_hb',               label: 'Prueba Rápida HB (Según exposición a riesgo)',                          profesional: 'enf' },
    { id: 'vej_prueba_hc',               label: 'Prueba Rápida HC (Según exposición a riesgo)',                          profesional: 'enf' },
    { id: 'vej_citologia',               label: 'Citología',                                                              profesional: 'med' },
    { id: 'vej_adn_vph',                 label: 'ADN – VPH',                                                             profesional: 'med' },
    { id: 'vej_colposcopia',             label: 'Colposcopia',                                                            profesional: 'med' },
    { id: 'vej_biopsia_cervico',         label: 'Biopsia cervicouterina',                                                 profesional: 'med' },
    { id: 'vej_valoracion_mama',         label: 'Valoración clínica de Mama (Cada 2 años)',                               profesional: 'med' },
    { id: 'vej_mamografia',              label: 'Mamografía (Cada dos años)',                                             profesional: 'med' },
    { id: 'vej_biopsia_mama',            label: 'Biopsia de mama (Según hallazgo)',                                       profesional: 'med' },
    { id: 'vej_tamizaje_psa',            label: 'Tamizaje CA Próstata PSA (Cada 5 años)',                                 profesional: 'med' },
    { id: 'vej_tamizaje_tacto',          label: 'Tamizaje CA Próstata Tacto (Cada 5 años)',                               profesional: 'med' },
    { id: 'vej_biopsia_prostata',        label: 'Biopsia de próstata (Según hallazgo)',                                   profesional: 'med' },
    { id: 'vej_tamizaje_colon',          label: 'Tamizaje CA Colon, sangre oculta (Cada 2 años)',                        profesional: 'med' },
    { id: 'vej_colonoscopia',            label: 'Colonoscopia y biopsia (Según hallazgo)',                                profesional: 'med' },
    { id: 'vej_atencion_psicologia',     label: 'Atención por Psicología (de acuerdo al riesgo)',                         profesional: 'psi' },
    { id: 'vej_atencion_nutricion',      label: 'Atención por Nutrición (de acuerdo al riesgo)',                          profesional: 'nut' },
    { id: 'vej_suministro_preservativos',label: 'Suministro de preservativos',                                            profesional: 'enf' },
    { id: 'vej_vacunacion',              label: 'Vacunación',                                                             profesional: 'aux' },
    { id: 'vej_edu_med',                 label: 'Educación individual Medicina General',                                  profesional: 'med' },
    { id: 'vej_edu_psi',                 label: 'Educación individual Psicología',                                        profesional: 'psi' },
    { id: 'vej_edu_enf',                 label: 'Educación individual Enfermería',                                        profesional: 'enf' },
    { id: 'vej_edu_odo',                 label: 'Educación individual Odontología',                                       profesional: 'odo' },
    { id: 'vej_edu_nut',                 label: 'Educación individual Nutrición',                                         profesional: 'nut' },
  ],

  materno_perinatal: [
    { id: 'mat_preconcepcional',         label: 'Atención Preconcepcional (Mujeres)',                                     profesional: 'med' },
    { id: 'mat_consulta_med',            label: 'Consulta Medicina General',                                              profesional: 'med' },
    { id: 'mat_controles',               label: 'Controles',                                                              profesional: 'enf' },
    { id: 'mat_laboratorios',            label: 'Laboratorios',                                                           profesional: 'med' },
    { id: 'mat_asesoria_ive',            label: 'Asesoría IVE',                                                           profesional: 'med' },
    { id: 'mat_control_prenatal',        label: 'Control Prenatal',                                                       profesional: 'med' },
    { id: 'mat_ginecologia',             label: 'Ginecología',                                                            profesional: 'med' },
    { id: 'mat_curso_maternidad',        label: 'Curso de preparación en maternidad y paternidad',                        profesional: 'enf' },
    { id: 'mat_odontologia',             label: 'Atención por Odontología',                                               profesional: 'odo' },
    { id: 'mat_nutricion',               label: 'Atención por Nutrición',                                                 profesional: 'nut' },
    { id: 'mat_trabajo_social',          label: 'Atención por Trabajo Social (Referencia)',                               profesional: 'enf' },
    { id: 'mat_psicologia',              label: 'Atención por Psicología',                                                profesional: 'psi' },
    { id: 'mat_micronutrientes',         label: 'Gestante: suplementación con micronutrientes',                           profesional: 'enf' },
    { id: 'mat_seguimiento_parto',       label: 'Seguimiento al Parto',                                                   profesional: 'med' },
    { id: 'mat_puerperio',               label: 'Atención al Puerperio',                                                  profesional: 'enf' },
    { id: 'mat_recien_nacido',           label: 'Control Recién Nacido',                                                  profesional: 'med' },
    { id: 'mat_educacion_familiar',      label: 'Educación Familiar',                                                     profesional: 'enf' },
    { id: 'mat_edu_med',                 label: 'Educación individual Medicina General',                                  profesional: 'med' },
    { id: 'mat_edu_psi',                 label: 'Educación individual Psicología',                                        profesional: 'psi' },
    { id: 'mat_edu_enf',                 label: 'Educación individual Enfermería',                                        profesional: 'enf' },
    { id: 'mat_edu_odo',                 label: 'Educación individual Odontología',                                       profesional: 'odo' },
    { id: 'mat_edu_nut',                 label: 'Educación individual Nutrición',                                         profesional: 'nut' },
  ],
};

// Metadatos de profesional → color y etiqueta
const PROF_META = {
  med: { color: 'var(--col-med)', label: 'Medicina General',    bg: '#eff6ff', text: '#1e40af' },
  enf: { color: 'var(--col-enf)', label: 'Enfermería',          bg: '#fefce8', text: '#854d0e' },
  psi: { color: 'var(--col-psi)', label: 'Psicología',          bg: '#faf5ff', text: '#6b21a8' },
  odo: { color: 'var(--col-odo)', label: 'Odontología',         bg: '#fff7ed', text: '#9a3412' },
  nut: { color: 'var(--col-nut)', label: 'Nutrición',           bg: '#fef2f2', text: '#991b1b' },
  aux: { color: 'var(--col-aux)', label: 'Auxiliares Enf.',     bg: '#f0fdf4', text: '#14532d' },
};

// ─── CÁLCULO DE EDAD ─────────────────────────────────────────
function calcularEdad() {
  const fnEl = document.getElementById('fecha_nacimiento');
  const edadEl = document.getElementById('edad');
  if (!fnEl.value) { edadEl.value = ''; return; }

  const hoy = new Date();
  const fn = new Date(fnEl.value + 'T00:00:00');
  let anios = hoy.getFullYear() - fn.getFullYear();
  let meses = hoy.getMonth() - fn.getMonth();
  let dias  = hoy.getDate() - fn.getDate();

  if (dias < 0) { meses--; }
  if (meses < 0) { anios--; meses += 12; }

  if (anios === 0) {
    const totalMeses = (hoy.getFullYear() - fn.getFullYear()) * 12 + hoy.getMonth() - fn.getMonth();
    if (totalMeses === 0) {
      const diffMs = hoy - fn;
      const diffDias = Math.floor(diffMs / 86400000);
      edadEl.value = `${diffDias} día(s)`;
    } else {
      edadEl.value = `${totalMeses} mes(es)`;
    }
  } else {
    edadEl.value = `${anios} año(s)`;
  }
}

// ─── RENDERIZADO DINÁMICO DE INTERVENCIONES ──────────────────
function renderIntervenciones() {
  const ciclo = document.getElementById('ciclo_vital').value;
  const container = document.getElementById('intervenciones-container');
  const leyenda = document.getElementById('leyenda');
  const otras = document.getElementById('otras-container');

  if (!ciclo || !INTERVENCIONES[ciclo]) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-slate-400">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        <p class="text-sm">Seleccione un ciclo vital para ver las intervenciones</p>
      </div>`;
    leyenda.classList.add('hidden');
    otras.classList.add('hidden');
    return;
  }

  leyenda.classList.remove('hidden');
  otras.classList.remove('hidden');

  const intervenciones = INTERVENCIONES[ciclo];

  // Agrupar por profesional
  const grupos = {};
  intervenciones.forEach(iv => {
    if (!grupos[iv.profesional]) grupos[iv.profesional] = [];
    grupos[iv.profesional].push(iv);
  });

  const orden = ['med', 'enf', 'aux', 'psi', 'odo', 'nut'];
  let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';

  orden.forEach(prof => {
    if (!grupos[prof]) return;
    const meta = PROF_META[prof];
    html += `
      <div class="prof-group border border-slate-100 rounded-xl p-3">
        <div class="prof-group-title" style="background:${meta.bg}; color:${meta.text}">
          ${meta.label}
        </div>
        <div>`;

    grupos[prof].forEach(iv => {
      html += `
        <div class="intervencion-item" onclick="toggleCheck('${iv.id}')">
          <div class="dot" style="background:${meta.color}; border: 1.5px solid rgba(0,0,0,.08)"></div>
          <input type="checkbox" id="${iv.id}" name="${iv.id}" value="1" />
          <label for="${iv.id}">${iv.label}</label>
        </div>`;
    });

    html += `</div></div>`;
  });

  html += '</div>';
  container.innerHTML = html;
}

function toggleCheck(id) {
  const cb = document.getElementById(id);
  if (cb) cb.checked = !cb.checked;
}

// ─── GUARDADO OFFLINE ─────────────────────────────────────────
function getPendientes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function setPendientes(arr) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

function actualizarContadores() {
  const pend = getPendientes();
  const n = pend.length;
  document.getElementById('pending-count').textContent = `${n} pendiente${n !== 1 ? 's' : ''}`;
  document.getElementById('registros-count').textContent = `${n} registro${n !== 1 ? 's' : ''}`;
  renderHistorial(pend);
}

function renderHistorial(pend) {
  const container = document.getElementById('historial-container');
  if (pend.length === 0) {
    container.innerHTML = '<p class="text-slate-400 text-sm text-center py-6">No hay registros almacenados localmente.</p>';
    return;
  }

  const rows = pend.map((r, i) => `
    <div class="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <div>
        <div class="font-medium text-sm text-slate-700">${r.nombre_apellido || '(sin nombre)'}</div>
        <div class="text-xs text-slate-400">${r.documento || ''} · ${r.ciclo_vital_label || r.ciclo_vital || ''} · ${r.fecha_atencion || ''}</div>
      </div>
      <div class="flex items-center gap-2">
        <span class="pending-badge">${r._status || 'Pendiente'}</span>
        <button onclick="eliminarRegistro(${i})" class="text-red-400 hover:text-red-600 transition text-xs" title="Eliminar">✕</button>
      </div>
    </div>
  `).join('');

  container.innerHTML = `<div class="divide-y divide-slate-50">${rows}</div>`;
}

function eliminarRegistro(idx) {
  const pend = getPendientes();
  pend.splice(idx, 1);
  setPendientes(pend);
  actualizarContadores();
  showToast('Registro eliminado', 'info');
}

// ─── SINCRONIZACIÓN ───────────────────────────────────────────
async function syncPendingRecords() {
  if (!navigator.onLine) {
    showToast('Sin conexión a internet', 'error');
    return;
  }

  const pend = getPendientes();
  if (pend.length === 0) {
    showToast('No hay registros pendientes', 'info');
    return;
  }

  document.getElementById('btn-sync').innerHTML = `
    <div class="spinner"></div>
    <span>Sincronizando...</span>`;

  let exitos = 0;
  let errores = 0;
  const fallidos = [];

  for (const registro of pend) {
    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors', // Google Apps Script requiere no-cors
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registro),
      });
      // Con no-cors, res.type === 'opaque'. Asumimos éxito si no lanza.
      exitos++;
    } catch (err) {
      console.error('[SYNC] Error en registro:', err);
      fallidos.push(registro);
      errores++;
    }
  }

  setPendientes(fallidos);
  actualizarContadores();

  document.getElementById('btn-sync').innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
    <span id="pending-count">${fallidos.length} pendientes</span>`;

  if (errores === 0) {
    showToast(`✓ ${exitos} registro(s) sincronizado(s)`, 'success');
  } else {
    showToast(`${exitos} sincronizados, ${errores} fallaron`, 'error');
  }
}

// ─── SUBMIT DEL FORMULARIO ────────────────────────────────────
document.getElementById('pci-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const form = e.target;

  // Validaciones básicas
  const required = ['fecha_atencion', 'eps', 'nombre_apellido', 'documento', 'fecha_nacimiento', 'municipio', 'ciclo_vital'];
  let valido = true;
  required.forEach(id => {
    const el = form.elements[id];
    if (!el || !el.value.trim()) {
      el && el.classList.add('border-red-400');
      valido = false;
    } else {
      el && el.classList.remove('border-red-400');
    }
  });

  if (!valido) {
    showToast('Complete los campos obligatorios (*)', 'error');
    return;
  }

  // Recopilar datos básicos
  const cicloVal = form.elements['ciclo_vital'].value;
  const cicloLabel = document.getElementById('ciclo_vital').options[document.getElementById('ciclo_vital').selectedIndex].text;

  const registro = {
    _id: Date.now() + Math.random().toString(36).slice(2),
    _timestamp: new Date().toISOString(),
    _status: 'Pendiente',
    fecha_atencion: form.elements['fecha_atencion'].value,
    eps: form.elements['eps'].value,
    nombre_apellido: form.elements['nombre_apellido'].value,
    documento: form.elements['documento'].value,
    fecha_nacimiento: form.elements['fecha_nacimiento'].value,
    edad: document.getElementById('edad').value,
    direccion: form.elements['direccion'] ? form.elements['direccion'].value : '',
    celular: form.elements['celular'] ? form.elements['celular'].value : '',
    municipio: form.elements['municipio'].value,
    codigo_microterritorio: form.elements['codigo_microterritorio'] ? form.elements['codigo_microterritorio'].value : '',
    codigo_familia: form.elements['codigo_familia'] ? form.elements['codigo_familia'].value : '',
    ciclo_vital: cicloVal,
    ciclo_vital_label: cicloLabel.replace(/^[^\w]+/, '').trim(),
    otras_intervenciones: document.getElementById('otras_intervenciones').value,
  };

  // Recopilar checkboxes de intervenciones
  const intervs = INTERVENCIONES[cicloVal] || [];
  intervs.forEach(iv => {
    const cb = document.getElementById(iv.id);
    registro[iv.id] = cb && cb.checked ? 'Sí' : 'No';
  });

  // Guardar localmente
  const pend = getPendientes();
  pend.push(registro);
  setPendientes(pend);
  actualizarContadores();

  showToast('✓ Registro guardado localmente', 'success');
  limpiarFormulario();

  // Intentar sincronizar si hay conexión
  if (navigator.onLine) {
    setTimeout(syncPendingRecords, 800);
  }
});

// ─── LIMPIAR FORMULARIO ───────────────────────────────────────
function limpiarFormulario() {
  document.getElementById('pci-form').reset();
  document.getElementById('edad').value = '';
  document.getElementById('ciclo_vital').value = '';
  renderIntervenciones();

  // Limpiar bordes de error
  document.querySelectorAll('.border-red-400').forEach(el => el.classList.remove('border-red-400'));
}

// ─── TOAST ────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const msgEl = document.getElementById('toast-msg');

  const styles = {
    success: 'bg-slate-800',
    error:   'bg-red-600',
    info:    'bg-blue-700',
  };

  toast.className = `${styles[type] || styles.success} text-white text-sm px-5 py-3 rounded-full shadow-xl flex items-center gap-2`;
  icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  msgEl.textContent = msg;

  // Añadir clase show
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}

// ─── ESTADO ONLINE / OFFLINE ──────────────────────────────────
function actualizarEstadoConexion() {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');

  if (navigator.onLine) {
    dot.className = 'w-2 h-2 rounded-full bg-green-400';
    text.textContent = 'En línea';
    // Auto-sync al recuperar conexión
    if (getPendientes().length > 0) syncPendingRecords();
  } else {
    dot.className = 'w-2 h-2 rounded-full bg-yellow-400 animate-pulse';
    text.textContent = 'Sin conexión';
    showToast('Sin conexión – modo offline activado', 'info');
  }
}

window.addEventListener('online',  actualizarEstadoConexion);
window.addEventListener('offline', actualizarEstadoConexion);

// ─── INIT ─────────────────────────────────────────────────────
(function init() {
  // Fecha de hoy por defecto
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('fecha_atencion').value = hoy;

  actualizarEstadoConexion();
  actualizarContadores();
})();
