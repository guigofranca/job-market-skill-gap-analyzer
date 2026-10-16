import type {
  AffirmativeGroup,
  Area,
  Benefit,
  Category,
  Contract,
  EnglishLevel,
  Level,
  SavedSource,
  Workplace,
} from '../api/schemas'

export const BENEFIT_LABELS: Record<Benefit, string> = {
  vale_refeicao: 'Vale-refeição/alimentação',
  refeicao_local: 'Refeição no local',
  vale_transporte: 'Vale-transporte',
  plano_saude: 'Plano de saúde',
  odontologico: 'Odontológico',
  seguro_vida: 'Seguro de vida',
  academia: 'Gympass/TotalPass',
  plr: 'PLR/bônus',
  educacao: 'Auxílio educação',
  home_office: 'Auxílio home office',
  day_off: 'Day off',
  horario_flexivel: 'Horário flexível',
  creche: 'Auxílio-creche',
  previdencia: 'Previdência privada',
  saude_mental: 'Apoio psicológico',
}

export const LEVEL_LABELS: Record<Level, string> = { estagio: 'Estágio', junior: 'Júnior' }

export const AREA_LABELS: Record<Area, string> = {
  dados: 'Dados',
  automacao: 'Automação',
  desenvolvimento: 'Desenvolvimento',
  infraestrutura: 'Suporte e Infraestrutura',
}

export const SOURCE_LABELS: Record<SavedSource, string> = {
  gupy: 'Gupy',
  solides: 'Sólides',
  remotar: 'Remotar',
}

export const CATEGORY_LABELS: Record<Category, string> = {
  linguagens: 'Linguagens',
  dados_bi: 'Dados & BI',
  bancos_de_dados: 'Bancos de Dados',
  cloud_devops: 'Cloud & DevOps',
  infra_suporte: 'Infraestrutura & Suporte',
  frameworks: 'Frameworks & Web',
  automacao_qa: 'Automação & QA',
  ia_ml: 'IA & Machine Learning',
  competencias_gerais: 'Competências Gerais',
}

export const WORKPLACE_LABELS: Record<Workplace, string> = {
  remoto: 'Remoto',
  hibrido: 'Híbrido',
  presencial: 'Presencial',
}

export const CONTRACT_LABELS: Record<Contract, string> = {
  clt: 'CLT',
  pj: 'PJ',
  estagio: 'Estágio',
  temporario: 'Temporário',
  freelancer: 'Freelancer',
}

/** Short names for the groups an affirmative-action posting is reserved for. */
export const AFFIRMATIVE_LABELS: Record<AffirmativeGroup, string> = {
  pcd: 'PcD',
  mulheres: 'mulheres',
  'pessoas-negras': 'pessoas negras',
  indigenas: 'indígenas',
  lgbtqia: 'LGBTQIAPN+',
  'pessoas-40-mais': 'pessoas 40+',
}

/** As a requirement: "Inglês intermediário". */
export const ENGLISH_REQUIRED_LABELS: Record<EnglishLevel, string> = {
  nenhum: 'Inglês',
  basico: 'Inglês básico',
  intermediario: 'Inglês intermediário',
  avancado: 'Inglês avançado',
  fluente: 'Inglês fluente',
}
