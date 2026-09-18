/* =====================================================================
   Emblemas oficiais de cada classe e de cada ministério.

   Um lugar só: se um emblema mudar, troca-se o arquivo em
   assets/classes/ e todas as telas acompanham.
   ===================================================================== */

/** Emblema do ministério — usado na barra colorida dos cards. */
export const EMBLEMA_CATEGORIA = {
  aventureiros:  'assets/classes/barra-aventureiros.png',
  desbravadores: 'assets/classes/barra-desbravadores.png',
  jovens:        'assets/classes/barra-jovens.png'
};

/** Emblema da classe de liderança — usado ao lado do nome e nos cabeçalhos. */
export const EMBLEMA_CLASSE = {
  lider_aventureiros:    'assets/classes/lider-aventureiros.png',
  lider_desbravadores:   'assets/classes/lider-desbravadores.png',
  lider_master:          'assets/classes/lider-master.png',
  lider_master_avancado: 'assets/classes/lider-master-avancado.png',
  lider_jovens:          'assets/classes/barra-jovens.png'   // JA, o mesmo
};

export const emblemaClasse    = chave     => EMBLEMA_CLASSE[chave] ?? 'assets/logo.png';
export const emblemaCategoria = categoria => EMBLEMA_CATEGORIA[categoria] ?? 'assets/logo.png';
