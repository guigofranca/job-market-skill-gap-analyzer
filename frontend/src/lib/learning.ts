/*
 * Where to learn each skill for free: an official course or the official docs (in Portuguese when
 * one exists). Links were checked by hand; keep them to stable, official, free pages (no affiliate
 * links). Skills without one (only CLP/PLC: no free official course) show no link.
 */

export interface LearningLink {
  /** Who publishes it, shown as the link text. */
  provider: string
  url: string
}

const MS_LEARN = 'Microsoft Learn'
const MDN = 'MDN'
const NETACAD = 'Cisco NetAcad'
const DOCS = 'Documentação oficial'
const DOCS_PT = 'Documentação (pt-BR)'

const link = (provider: string, url: string): LearningLink => ({ provider, url })
const msTraining = (terms: string) =>
  link(
    MS_LEARN,
    `https://learn.microsoft.com/pt-br/training/browse/?terms=${encodeURIComponent(terms)}`,
  )

const COURSES: Readonly<Record<string, LearningLink>> = {
  // Linguagens
  python: link('Tutorial oficial (pt-BR)', 'https://docs.python.org/pt-br/3/tutorial/'),
  javascript: link(MDN, 'https://developer.mozilla.org/pt-BR/docs/Web/JavaScript/Guide'),
  typescript: link(DOCS, 'https://www.typescriptlang.org/docs/'),
  java: link('dev.java', 'https://dev.java/learn/'),
  csharp: link(MS_LEARN, 'https://learn.microsoft.com/pt-br/dotnet/csharp/'),
  php: link(DOCS_PT, 'https://www.php.net/manual/pt_BR/'),
  go: link('Tour of Go', 'https://go.dev/tour/'),
  r: link('R for Data Science', 'https://r4ds.hadley.nz/'),
  kotlin: link(DOCS, 'https://kotlinlang.org/docs/getting-started.html'),
  swift: link('Apple Developer', 'https://developer.apple.com/tutorials/swiftui'),
  ios: link('Apple Developer', 'https://developer.apple.com/tutorials/app-dev-training'),
  ruby: link(DOCS_PT, 'https://www.ruby-lang.org/pt/documentation/'),
  rust: link('The Rust Book', 'https://doc.rust-lang.org/book/'),
  cpp: link(MS_LEARN, 'https://learn.microsoft.com/pt-br/cpp/cpp/'),
  scala: link(DOCS_PT, 'https://docs.scala-lang.org/pt-br/tour/tour-of-scala.html'),
  vba: link(
    MS_LEARN,
    'https://learn.microsoft.com/pt-br/office/vba/library-reference/concepts/getting-started-with-vba-in-office',
  ),
  shell: link('Manual do Bash', 'https://www.gnu.org/software/bash/manual/bash.html'),
  // Dados e BI
  'power-bi': link(MS_LEARN, 'https://learn.microsoft.com/pt-br/training/powerplatform/power-bi'),
  dax: link(MS_LEARN, 'https://learn.microsoft.com/pt-br/dax/'),
  'power-query': link(MS_LEARN, 'https://learn.microsoft.com/pt-br/power-query/'),
  excel: link('Microsoft Suporte', 'https://support.microsoft.com/pt-br/excel'),
  statistics: link('Khan Academy', 'https://pt.khanacademy.org/math/statistics-probability'),
  pandas: link(DOCS, 'https://pandas.pydata.org/docs/getting_started/index.html'),
  numpy: link(DOCS, 'https://numpy.org/learn/'),
  databricks: link('Databricks', 'https://www.databricks.com/learn'),
  spark: link(DOCS, 'https://spark.apache.org/docs/latest/quick-start.html'),
  airflow: link(DOCS, 'https://airflow.apache.org/docs/apache-airflow/stable/tutorial/index.html'),
  kafka: link(DOCS, 'https://kafka.apache.org/quickstart'),
  dbt: link('dbt Learn', 'https://learn.getdbt.com/'),
  bigquery: link('Google Cloud', 'https://cloud.google.com/bigquery/docs/introduction'),
  snowflake: link('Snowflake', 'https://learn.snowflake.com/'),
  looker: link('Google Cloud', 'https://cloud.google.com/looker/docs'),
  tableau: link('Tableau (vídeos grátis)', 'https://www.tableau.com/pt-br/learn/training'),
  qlik: link('Qlik Learning', 'https://learning.qlik.com/'),
  etl: msTraining('ETL'),
  'data-warehouse': msTraining('data warehouse'),
  // Bancos de dados
  sql: link('Khan Academy', 'https://pt.khanacademy.org/computing/computer-programming/sql'),
  mysql: link(DOCS, 'https://dev.mysql.com/doc/refman/8.4/en/tutorial.html'),
  oracle: link('Oracle MyLearn', 'https://mylearn.oracle.com/'),
  nosql: link('MongoDB University', 'https://learn.mongodb.com/'),
  postgresql: link(DOCS, 'https://www.postgresql.org/docs/current/tutorial.html'),
  'sql-server': link(MS_LEARN, 'https://learn.microsoft.com/pt-br/sql/sql-server/'),
  mongodb: link('MongoDB University', 'https://learn.mongodb.com/'),
  redis: link('Redis', 'https://redis.io/learn'),
  // Cloud e DevOps
  git: link('Pro Git (pt-BR)', 'https://git-scm.com/book/pt-br/v2'),
  aws: link('AWS Skill Builder', 'https://skillbuilder.aws/'),
  azure: link(MS_LEARN, 'https://learn.microsoft.com/pt-br/training/azure/'),
  gcp: link('Google Cloud', 'https://cloud.google.com/learn/training?hl=pt-br'),
  linux: link(NETACAD, 'https://www.netacad.com/'),
  docker: link(DOCS, 'https://docs.docker.com/get-started/'),
  kubernetes: link(DOCS_PT, 'https://kubernetes.io/pt-br/docs/tutorials/kubernetes-basics/'),
  'ci-cd': link('GitHub Actions', 'https://docs.github.com/pt/actions'),
  terraform: link('HashiCorp', 'https://developer.hashicorp.com/terraform/tutorials'),
  // Infra e suporte
  networking: link(NETACAD, 'https://www.netacad.com/'),
  hardware: link(NETACAD, 'https://www.netacad.com/'),
  'information-security': link(NETACAD, 'https://www.netacad.com/'),
  firewall: link(NETACAD, 'https://www.netacad.com/'),
  windows: link(MS_LEARN, 'https://learn.microsoft.com/pt-br/training/browse/?products=windows'),
  'active-directory': msTraining('active directory'),
  'microsoft-365': msTraining('microsoft 365'),
  virtualization: msTraining('hyper-v'),
  ticketing: link('Atlassian (guia de ITSM)', 'https://www.atlassian.com/br/itsm'),
  itil: link('Atlassian (guia de ITSM)', 'https://www.atlassian.com/br/itsm'),
  // Frameworks e web
  'rest-api': link(MDN, 'https://developer.mozilla.org/pt-BR/docs/Web/HTTP'),
  html: link(MDN, 'https://developer.mozilla.org/pt-BR/docs/Web/HTML'),
  css: link(MDN, 'https://developer.mozilla.org/pt-BR/docs/Web/CSS'),
  react: link(DOCS_PT, 'https://pt-br.react.dev/learn'),
  nodejs: link(DOCS_PT, 'https://nodejs.org/pt/learn'),
  angular: link(DOCS, 'https://angular.dev/tutorials'),
  vue: link(DOCS, 'https://vuejs.org/guide/introduction.html'),
  dotnet: link(MS_LEARN, 'https://learn.microsoft.com/pt-br/training/dotnet/'),
  microservices: link(
    MS_LEARN,
    'https://learn.microsoft.com/pt-br/dotnet/architecture/microservices/',
  ),
  spring: link('Spring Guides', 'https://spring.io/guides'),
  django: link(DOCS_PT, 'https://docs.djangoproject.com/pt-br/stable/intro/'),
  flask: link(DOCS, 'https://flask.palletsprojects.com/'),
  fastapi: link(DOCS_PT, 'https://fastapi.tiangolo.com/pt/tutorial/'),
  laravel: link(DOCS, 'https://laravel.com/docs'),
  nextjs: link('Next.js Learn', 'https://nextjs.org/learn'),
  'react-native': link(DOCS, 'https://reactnative.dev/docs/getting-started'),
  android: link('Android Developers', 'https://developer.android.com/courses?hl=pt-br'),
  flutter: link(DOCS, 'https://docs.flutter.dev/get-started'),
  graphql: link(DOCS, 'https://graphql.org/learn/'),
  tailwind: link(DOCS, 'https://tailwindcss.com/docs'),
  // Automação e QA
  'test-automation': link('Selenium', 'https://www.selenium.dev/documentation/'),
  playwright: link(DOCS, 'https://playwright.dev/docs/intro'),
  cypress: link(DOCS, 'https://docs.cypress.io/'),
  selenium: link(DOCS, 'https://www.selenium.dev/documentation/'),
  postman: link('Postman Academy', 'https://learning.postman.com/'),
  'robot-framework': link(DOCS, 'https://www.robotframework.org/'),
  'power-automate': link(MS_LEARN, 'https://learn.microsoft.com/pt-br/training/powerplatform/'),
  'power-apps': link(MS_LEARN, 'https://learn.microsoft.com/pt-br/training/powerplatform/'),
  uipath: link('UiPath Academy', 'https://academy.uipath.com/'),
  rpa: link('UiPath Academy', 'https://academy.uipath.com/'),
  'automation-anywhere': link(
    'Automation Anywhere University',
    'https://university.automationanywhere.com/',
  ),
  'blue-prism': link('Blue Prism University', 'https://www.blueprism.com/university/'),
  n8n: link('Cursos do n8n', 'https://docs.n8n.io/courses/'),
  // IA e ML
  ai: link('Elements of AI', 'https://www.elementsofai.com/'),
  genai: link('DeepLearning.AI', 'https://www.deeplearning.ai/short-courses/'),
  'machine-learning': link(
    'Google ML Crash Course',
    'https://developers.google.com/machine-learning/crash-course?hl=pt-br',
  ),
  'scikit-learn': link(DOCS, 'https://scikit-learn.org/stable/getting_started.html'),
  tensorflow: link(DOCS_PT, 'https://www.tensorflow.org/tutorials?hl=pt-br'),
  pytorch: link(DOCS, 'https://pytorch.org/tutorials/'),
  'deep-learning': link('Dive into Deep Learning', 'https://d2l.ai/'),
  nlp: link('Hugging Face', 'https://huggingface.co/learn/nlp-course'),
  // Competências gerais
  agile: link('Guia do Scrum', 'https://scrumguides.org/'),
  jira: link('Atlassian', 'https://www.atlassian.com/pt/software/jira/guides'),
  office: link('Microsoft Suporte', 'https://support.microsoft.com/pt-br/office'),
  english: link('BBC Learning English', 'https://www.bbc.co.uk/learningenglish'),
  spanish: link('Duolingo', 'https://www.duolingo.com/'),
}

/** The free course for a skill, when there is one. */
export function learningLink(slug: string): LearningLink | undefined {
  // hasOwn: a slug such as "constructor" must not resolve to an Object.prototype member.
  return Object.hasOwn(COURSES, slug) ? COURSES[slug] : undefined
}
