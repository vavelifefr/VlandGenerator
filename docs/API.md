# API VlandGenerator 4

Публичный контракт — 4. Предыдущие форматы и прямое размещение экземпляров отсутствуют. Геометрические снимки независимых engine-провайдеров сохраняют собственные версии. `app/index.mjs` — проект и генерация, `content/index.mjs` — независимый модуль источников для любой тайловой карты, `engine/api/index.mjs` — низкоуровневые генераторы.

## Полный проект через JavaScript

```js
import {
  createRecipe, generateBase, materialize, editProject,
  contentScene, validateProject, exportRuntime, previewSource,
  previewDistribution, applyDistribution
} from './VlandGenerator/app/index.mjs';
import {
  createSource, createDistributionRequest,
  createSpawnState, planSpawns, commitSpawnPlan, updateSpawnState
} from './VlandGenerator/content/index.mjs';

const recipe = await createRecipe('dungeon');
recipe.seed = 42;
recipe.generation.rooms.count = 12; // кроме старта и выхода
let project = await generateBase(recipe); // sources: []
const layer = (await materialize(project))[0];
const source = createSource({
  id: 'guards', name: 'Охрана', kind: 'zone',
  category: 'fauna', layer, catalogId: 'guard', seed: 71
});
source.rules[0].quantity = { mode: 'count', min: 4, max: 6, density: 1 };
source.schedule = {
  trigger: 'enter', signalId: null, repeat: 'cycle',
  clock: 'turns', delay: 1, interval: 5
};
source.limits = { maxAlive: 6, batchSize: 2, total: 20, populationId: null };
project = await editProject(project, { type: 'source.put', source });
const preview = await previewSource(project, 'guards', { phase: 'day' }, true);
if (!preview.validation.ok) throw new Error(preview.validation.errors.join('; '));
const runtime = await exportRuntime(project);
// runtime.scene содержит map, catalog, sources.
// runtime.initialState.entities пуст: пробный результат не записан в проект.
```

Режим recipe.mode должен быть строкой из `/api/contract.modes`; массивы (включая `["dungeon"]`), объекты, null, числа и boolean отклоняются с UNKNOWN_MODE. Это одинаково для createRecipe, normalizeRecipe, generateBase, Worker, HTTP и CLI; неверное задание не создаёт карту и не заменяет выходной файл CLI.

Существующие файлы открывайте `importProject(json)`, а рецепт для новой основы получайте `recipeFromProject(project)`. `materialize` возвращает геометрию для редактора; нейтральную сцену — `contentScene`. Не редактируйте вручную project.checksum: используйте операции.

## Бюджеты входных документов

`normalizeRecipe`/`generateBase` ограничивают рецепт1MiB, `importProject` — проект24MiB (`/api/contract.limits.recipeBytes/projectBytes`). Для JSON-строки считаются её исходные байты UTF-8, включая пробелы/BOM; для уже разобранного объекта — байты компактного JSON. Считать символы вместо байтов нельзя: кириллица/emoji занимают больше. Объектная форма не обходит бюджет. Лимит включителен: ровно допустимое число байтов принимается.

Превышение даёт TOO_LARGE до проверки полей/генерации; циклы и BigInt, которые нельзя представить в JSON, дают INVALID_JSON. Объект копируется независимо и не переписывается. Семантический лимит рецепта возвращает HTTP400, CLIexit1 без перезаписи выходного файла. Отдельный предел всего HTTP-тела24MiB возвращает413; обёртка запроса тоже занимает место. Лимиты и формат4 не изменены. JSON Schema описывает структуру, байтовый бюджет проверяется исполняемым кодом.

## Одноразовая точка

`createSource({kind:'spawner', x, y, radius:0, ...})` создаёт программу точки появления. Для одного сундука задайте category items, catalogId chest, quantity count/min/max 1, schedule.repeat once, limits maxAlive/batchSize/total 1. Координаты необходимо предварительно проверить через `analyzeSource` или `checkPlacement`, а не брать произвольную клетку стены. Начальный источник может иметь вид zone для поиска допустимых позиций, затем его area заменяется точкой и kind — spawner.

Радиус ограничивает якорь габарита. При радиусе 0 существо 3×3 занимает клетки x..x+2, y..y+2 и должно полностью помещаться в свободном месте. Зона, в отличие от радиуса, должна включать весь габарит.

## Автоматическое распределение источников

```js
const template = createSource({
  id: 'template', name: 'Сундуки', kind: 'spawner',
  category: 'items', layer, catalogId: 'chest', radius: 0
});
template.limits = { maxAlive: 1, batchSize: 1, total: 1, populationId: null };
const request = createDistributionRequest(template, [layer.id]);
request.groupId = 'rewards';
request.placement = { mode: 'count', count: 5, density: 1, minDistance: 4 };
const deltaPreview = await previewDistribution(project, request);
if (deltaPreview.validation.ok)
  project = await applyDistribution(project, deltaPreview);
```

Распределение создаёт программы, а не живые сущности. Zone-шаблон даёт одну область подходящих клеток на выбранный уровень; spawner-шаблон — точки в количестве/плотности placement. Это отдельная величина от quantity внутри программы. Повторный запуск заменяет только автоматические источники той же группы на выбранных уровнях. Ручные изменения становятся manual; занятые ими стабильные ID сохраняются и перечисляются в report.preservedIds.

`content.distributeSources(scene, request)` возвращает чистый delta `{request,sceneFingerprint,removeIds,sources,report}`. Без app-обёртки вызывающий код сам проверяет актуальность сцены, объединяет sources и валидирует результат. App-операция применяет предпросмотр атомарно и повторно пересчитывает его.

## Runtime: план, создание, подтверждение

В утилите нет живого игрового цикла. Ни одна функция не запускает таймер. Host передаёт текущее монотонное время в секундах/ходах, фазу суток, активации, флаги и внешнюю занятость. Все функции чистые и возвращают новые объекты.

```js
const scene = runtime.scene;
let state = runtime.initialState;
let plan = planSpawns(scene, state, {
  clock: { seconds: 0, turns: 0 }, phase: 'day',
  activeLayerIds: [layer.id], enteredSourceIds: ['guards']
});
state = commitSpawnPlan(scene, state, plan, { acceptedIds: [] });
// Активация запомнена. Через ход задержка истекла.
plan = planSpawns(scene, state, { clock: { seconds: 0, turns: 1 } });
const acceptedIds = [];
for (const command of plan.commands) {
  const definition = scene.catalog.find(e => e.id === command.catalogId);
  const properties = { ...definition.properties, ...command.properties };
  // Проверить коллизию/навигацию движка, создать с command.id идемпотентно.
  // if (host.tryCreate(command, definition, properties)) acceptedIds.push(command.id);
}
state = commitSpawnPlan(scene, state, plan, { acceptedIds });
// Сохранить state вместе с подтверждёнными объектами мира в одной транзакции.
```

Пустой acceptedIds означает: host не создал ничего. Пропущенные/отклонённые команды не расходуют квоты. Если options не передан, commit подтверждает все команды: это удобно для теста, но host должен явно подтверждать лишь успешно созданные.

Сохраняйте даже план без команд через commit: он фиксирует активацию, расписание и выбранную цель правила. Повторный commit старого плана отклоняется STALE_PLAN. Для восстановления после сбоя host должен хранить ID созданных объектов и состояние атомарно либо иметь идемпотентный журнал подтверждений. Новый createSpawnState при каждой загрузке заново разрешит однократные появления — так делать нельзя.

```js
state = updateSpawnState(scene, state, {
  removeIds: ['spawn-ID-from-state'], // смерть, подбор, удаление
  moves: [{ id: 'another-live-ID', x: 12, y: 8, layerId: layer.id }]
});
state = updateSpawnState(scene, state, { disabledSourceIds: ['guards'] });
// disabledSourceIds заменяет полный список отключённых источников.
// Пустой список разрешает их снова, но не сбрасывает выполненные квоты.
```

Часы не идут назад. `turns` — целое. Переход времени не воспроизводит пропущенные сотни циклов: одна попытка на источник за вызов plan, следующая после now+interval. Учитываются только активные источники/уровни; скрытые области можно исключать через activeLayerIds/activeSourceIds. Лимиты общей популяции всё равно видят все принадлежащие ей живые сущности, включая другие уровни и вышедших за радиус.

Контекст по умолчанию: phase day, оба clock из state, все уровни/источники активны, пустые enteredSourceIds/nearbySourceIds/signals/flags/occupied. Активация enter/proximity/signal защёлкивается и сохраняется до подходящего времени/условий. signals содержит ID сигналов, остальные списки активации — ID источников. Флаги точного false требуют переданного false; отсутствующий флаг условию не соответствует.

`occupied` — массив внешних объектов `{id,catalogId,layerId,x,y,properties}`, без origin. Он дополняет занятость, но не лимиты владельцев. Не дублируйте в нём state.entities и map.fixtures. Передавайте все внешние препятствия, способные повлиять на выбранную активную область. Движения через update проверяют габарит/границы и ссылки; фактическую физику движения проверяет host.

Для описанного в representation видимого/разрушаемого блока host сам выбирает визуализацию, коллизию и сигнал разрушения. Программа источника не создаёт такой блок автоматически и не резервирует его клетку. Если блок физически занимает место, включите его в occupied и проверяйте навигацию.

## Операции JS / HTTP / CLI

`execute(operation,input)` использует те же операции, что Worker редактора и сервер.

| Операция | Вход | Выход |
|---|---|---|
| defaults | `{mode}` | vland.recipe/4 |
| generate-base | `{recipe}` или рецепт | vland.project/4 |
| landscape-rebuild | `{project,recipe}` | новая ревизия проекта с сохранением ручных данных |
| import | `{project}` или проект/строка | проверенный проект |
| edit | `{project,operation}` | новая ревизия проекта |
| validate | `{project}` или проект | `{ok,errors,warnings,...}` |
| source-preview | `{project,sourceId,context?,simulateActivation?}` | vland.source.preview/4 |
| distribution-preview | `{project,request}` | vland.distribution.preview/4 |
| distribution-apply | `{project,preview}` | новый проект |
| runtime | `{project}` или проект | vland.runtime/4 |
| export | `{project,format,options?}` | project / recipe / runtime / llm-context |
| raster-export | `{project,options?}` | vland.raster/4 с PNG в base64 |
| diagnose | `{project}` или проект | массив геометрических отчётов |
| runtime-init | `{scene}` | vland.spawn.state/4 |
| runtime-plan | `{scene,state,context?}` | vland.spawn.plan/4 |
| runtime-commit | `{scene,state,plan,options?}` | новое состояние |
| runtime-update | `{scene,state,operation}` | новое состояние |
| transition-resolve | `{runtime,state,linkId,fromSourceId}` | `{ok,...}` готовность и назначение авторского перехода |

Задания проверяются по required/optional в operationDetails: неизвестное поле JSON-обёртки даёт UNKNOWN_FIELD, отсутствующее обязательное — INVALID_INPUT с именем поля. У export сохраняется отдельный INVALID_EXPORT для отсутствующего/неверного format. Формы raw recipe/project и JSON-строка для generate-base/import из таблицы поддерживаются; это самостоятельные документированные входы. `contract` доступен как execute/CLI без задания и как GET /api/contract, не POST /api/contract.

Прямые функции app: previewSource(project,sourceId,context={},simulateActivation=false), previewDistribution(project,request), applyDistribution(project,preview). Прямые функции content описаны ниже. simulateActivation предназначен только для пробного предпросмотра; для игрового исполнения используйте реальный контекст.

Операции редактора строго ограничены:

- `source.put`: `{type,source}`. Добавить/заменить программу; origin становится manual.
- `source.mask`: `{type,sourceId,mask,operation:'add'|'subtract'|'replace'}`. Только для zone, также закрепляет manual.
- `source.remove`: `{type,sourceId}`. Удалить программу.
- `transport.connect`: `{type,fromSourceId,toSourceId,bidirectional?,travelCost?}` либо `{type,fromSourceId,target:{layerId,x,y},bidirectional?,travelCost?}`. Связать существующие точки либо атомарно создать парную точку и связь. Нельзя передавать toSourceId и target одновременно. Доступность проверяется до применения; ошибка оставляет исходный проект целым.
- `transport.disconnect`: `{type,linkId}`. Удалить авторскую связь, сохранив обе программы.
- `catalog`: `{type,catalog}`. Обновить определения с проверкой ссылок и защиты обязательных элементов.
- `paint`: `{type,layerId,x,y,surface,trait?}`. Изменить поверхность; маршруты и обязательные элементы защищены.
- `field`: `{type,layerId,x,y,field:'biome'|'fertility',value}`.
- `reset-edits`: `{type}`. Убрать правки основы.

Операций place/move/update/remove для авторских сущностей и прежних zone-* API нет.

## Независимый content-модуль

Скопируйте content/ целиком. Он не импортирует app, engine, Node, DOM или сторонние библиотеки. Можно использовать собственную карту и каталог без установки всей утилиты. Полные JSON-схемы лежат в schemas/; внутренние семантические проверки выполняют функции модуля.

Сцена в памяти: `{map,catalog,sources}`. Map — vland.content.map/4, уровни содержат width/height и плоские массивы row-major: index=y*width+x. Обязательны id/kind/z/depth/solid/material/water, остальные поля — по данным карты. Не генерируйте фиктивные метрики для обхода условий. Неизвестная среда, порода или отсутствующая требуемая метрика приводит к отказу, а не к расширению правил.

- validateScene, validateMap, validateCatalog, validateConstraints, validateSources проверяют контракты и ссылки.
- createSource, defaultRule, normalizeSource, sourceMask создают программы и маски.
- analyzeSource(scene,sourceId) возвращает area, eligibleMask и отчёты по правилам.
- eligiblePositions(scene,source,rule) — подходящие якоря и совместимые типы, без динамической занятости.
- createDistributionRequest, normalizeDistributionRequest, distributeSources — распределение самих программ.
- createSpawnState, validateSpawnState, planSpawns, commitSpawnPlan, updateSpawnState — чистый жизненный цикл появления.
- rectangleMask, circleMask, polygonMask, floodMask, combineMasks, maskFromCells, maskCells — клеточные маски.
- checkPlacement, occupancyIndex, canShare, bodyCells — проверки полного габарита и каналов.
- serializeScene/parseScene ограничивают внешний документ24MiB UTF-8: исходный текст или компактное представление объекта. После1MiB serializeScene использует компактный JSON, сохраняя импортируемость больших сцен. Документ сверх24MiB отклоняется TOO_LARGE до выдачи; модуль остаётся независимым от app/engine/Node.
- serializeScene/parseScene сериализуют внешний контейнер vland.content.scene/4. В памяти schema-поля контейнера отсутствуют; их добавляет сериализация.

`programFingerprint` связывает состояние с каталогом, программами и размерами физических уровней. Рельеф может изменяться без сброса счётчиков; его актуальные значения заново проверяются при появлении. Изменение самих программ/каталога требует явного нового состояния или собственного прикладного преобразования; автоматических миграций нет. План дополнительно связан со всей текущей сценой и checksum состояния.

## HTTP

По умолчанию сервер слушает 127.0.0.1:9670. GET `/api/health`, `/api/contract`, `/api/defaults?mode=dungeon`, `/api/projects`, `/api/projects/ID`. POST `/api/ОПЕРАЦИЯ` принимает тот же JSON, что execute; результат возвращается напрямую, без оболочки result.

PUT `/api/projects/ID`: `{project,expectedRevision}`. Для создания нового файла expectedRevision null; для перезаписи используйте токен revision из последнего GET/PUT. Это токен файла, а не project.revision. Несовпадение даёт 409 без перезаписи. projects/ не выдаётся статически. Файлы сохраняются только явно, атомарной заменой. Контракт неизвестного формата/поля отвергается; ошибка `{error:{code,message,details}}`.

Отправляйте POST/PUT с Content-Type application/json; внешние Origin отклоняются. Сервер локальный, не имеет публичной аутентификации; правила публикации описаны в [LIMITATIONS.md](LIMITATIONS.md).

## CLI

```text
node cli.mjs defaults dungeon recipe.json
node cli.mjs generate-base recipe.json project.json
node cli.mjs edit edit-job.json with-sources.json
node cli.mjs source-preview source-job.json preview.json
node cli.mjs distribution-preview distribution-job.json distribution.json
node cli.mjs distribution-apply apply-job.json final-project.json
node cli.mjs runtime final-project.json runtime.json
node cli.mjs runtime-init init-job.json state.json
node cli.mjs runtime-plan plan-job.json plan.json
node cli.mjs runtime-commit commit-job.json next-state.json
node cli.mjs validate final-project.json
```

Задания — JSON из таблицы операций. CLI читает UTF-8, результат пишет в файл последнего аргумента или stdout. Ошибки идут в stderr, exit 1; невалидный отчёт validate — exit 2. Начните с [исполняемого примера](../examples/content-workflow.mjs) и [контракта данных](CONTENT_CONTRACT.md).

## Изоляция и транспортные переходы

Для Данжа: recipe.generation.layout.allowDisconnected = true. Для ярусов: recipe.generation.layers[i].request.layout.allowDisconnected = true. По умолчанию false. Допускаются независимые боковые участки с автоматическим доступом; число, размер, вероятность и виды задаются настройками ниже. Основной маршрут физически не разрывается. Отсутствие подходящего компонента допустимо, причина указана в level.isolation.reason. Обычные connections соответствуют layout.corridors, по умолчанию 1–3 клетки.

Native level.transportLinks содержит {id,edgeId,kind,bidirectional,from:{roomId,x,y},to:{roomId,x,y}}. Внутрислойный kind — teleport. Внешний доступ лестницами и лифтами хранится в world.verticalLinks; level.externalTransports описывает, какое логическое ребро заменено этим доступом, и не является локальным скачком координат. Транспорт заменяет одно открытое ребро plan.edges и исключается из физических connections. Точки обязаны находиться на свободном защищённом полу, не перекрывать механизмы. Удаление связи или выключение флага делает такой snapshot недопустимым.

## Настройки автоматического доступа

Настройки входят в существующие defaults / generate-base / validate / runtime, доступны одинаково в JS, HTTP и CLI. API contract содержит automaticTransports с путями и поддерживаемыми видами. Добавлять источники или связывать ID вручную после generate-base не требуется.

| Поле | Диапазон / значение по умолчанию | Смысл |
|---|---|---|
| maxGroups | целое 1–4; 1 | Максимум независимых участков на этаж |
| maxRoomsPerGroup | целое 1–8; 3 | Максимум обычных комнат в участке |
| chance | число 0–1; 1 | Вероятность изоляции в каждой из maxGroups попыток |
| travelCost | число 1–1000; 1 | Стоимость автоматической связи для host |
| landingSize | целое 1–3; 1 | Сторона квадратной площадки лифта/лестницы; только tiers |
| types | веса teleport/lift/stairs 0–100; все 1 | Разрешённые виды доступа в tiers |

Для **dungeon**: `generation.layout.allowDisconnected` включает изоляцию, `generation.layout.transports` содержит четыре общих поля. Здесь доступны телепорты между участками одного этажа. Native friendly request использует `layout.transports`, advanced recipe — `generator.transports`.

Для **tiers**: флаг задаётся в `generation.layers[i].request.layout.allowDisconnected` для friendly request, либо request.generator.allowDisconnected для advanced recipe. Настройки `generation.autoTransports` применяются ко всем этажам, перекрывая их локальные transports. Вид и лимиты первичных связей `generation.links` настраиваются отдельно. Веса autoTransports не удаляют основную межъярусную лестницу или лифт.

```json
{
  "maxGroups": 3,
  "maxRoomsPerGroup": 3,
  "chance": 0.75,
  "travelCost": 2,
  "landingSize": 1,
  "types": {"teleport": 1, "lift": 2, "stairs": 2}
}
```

Это точное значение generation.autoTransports, а не самостоятельный рецепт. Если types передан частично, пропущенные виды получают вес 0: `{lift:1}` разрешает только лифты. Если types отсутствует, веса равны. Неизвестные поля, нечисловые/нефинитные значения, нулевые все веса и выход за диапазоны отклоняются. Для вертикальных видов нужен другой ярус и просвет от 2 с обеих сторон; если разрешены только они и подходящих ярусов нет, задание отклоняется.

```js
const recipe = await createRecipe('tiers');
recipe.seed = 4147868664;
for (const layer of recipe.generation.layers)
  layer.request.layout = { ...layer.request.layout, allowDisconnected: true };
recipe.generation.autoTransports = {
  maxGroups: 3, maxRoomsPerGroup: 3, chance: 1,
  travelCost: 2, landingSize: 1, types: {lift: 1}
};
const project = await generateBase(recipe);
const report = await validateProject(project);
const runtime = await exportRuntime(project);
```

Исполняемый вариант с гарантированно подходящим пресетом: [automatic-transports.mjs](../examples/automatic-transports.mjs). Команда `node examples/automatic-transports.mjs examples` создаёт полный automatic-access-recipe.json и проверенные project/runtime/validation. Этот рецепт можно отправить в POST api/generate-base либо `node cli.mjs generate-base examples/automatic-access-recipe.json map.json`. Получение defaults перед изменением настроек сохраняет обязательный catalog формата 4.

Генератор ищет открытые мостовые рёбра вне основного пути; компоненты не пересекаются. Доступная сторона входа должна быть достижима без замка. Для каждого выбранного участка создаётся пара. Телепорт остаётся в transportLinks уровня; лестница/лифт получает реальную запись world.verticalLinks, две защищённые площадки на разных уровнях и provenance `{automatic:true,isolation:{layerId,edgeId}}`. Основной физический маршрут, старт/выход/босс и проходы заданного диапазона сохраняются. Нулевая вероятность не создаёт разрывов; квота не заполняется искусственно, если подходящих участков нет.

`source.level.isolation` содержит groups `{edgeId,transportId,roomIds}` и общий isolatedRoomIds. В мире это доступно на каждом source.layers[i].dungeon.level; дополнительно `source.automaticTransports` возвращает settings, groups `{layerId,edgeId,roomIds,kind,linkId}` и counts по видам. Максимум 32 участка в мире из 8 ярусов; до 24 заданных основных и до 32 автоматических вертикальных связей, общий защитный лимит 64.

`level.externalTransports` хранит требование внешнего доступа к отсечённому логическому ребру и worldLinkId. Это не локальная телепортация и не навигационная команда. Такой слой проверяется только в составе validateWorld / validateProject: отдельно validateDungeon его отвергает. Проверка геометрии слоя учитывает заявленный внешний доступ, а world-проверка независимо требует настоящую связь, свободные площадки, доступность обоих концов и возврат к входу мира. Подмена ссылки, удаление пары или площадки делает мир невалидным. Сохранённый validation.ok не считается доказательством.

В `runtime.links` все связи нормализованы: origin base, automatic true для этих переходов, kind, bidirectional, travelCost, from/to с layerId/x/y/footprint. Native-метаданные сохраняются дополнительно. runtime.navigation включает externalTransports для объяснения логических рёбер; для исполнения используйте реальные runtime.links. Автоматические объекты — обязательные scene.map.fixtures с properties.transportId/destination, они создаются host вместе с геометрией. Начальное состояние entities и authored sources остаются пустыми. resolveTransition предназначен для подтверждённых авторских source-пар; для fixtures host исполняет явную связь основы.

Подтверждается клеточный профиль walker 1×1 с высотой 1.8. Вся площадка должна помещаться на свободном полу; дополнительные габариты/физику проверяйте через findWorldPath(world,from,to,{profile}) и адаптер своего движка. После ручных правок app проверяет сохранённые площадки и подходы повторно. Блокирующее наполнение не должно занимать их; внутренняя генерация контента не затапливает комнаты прибытия и не ставит сущности поверх переходов. Утилита создаёт основу без необязательного native-наполнения и настраивает его отдельно.

runtime.links объединяет вертикальные связи ярусов с внутрислойными transportLinks; у последних обе стороны дополнены layerId, а ID имеет префикс уровня. runtime.navigation также содержит transportLinks. Геометрические точки находятся в scene.map.fixtures с properties.transportId, destination, bidirectional и structural:true. Это обязательные элементы основы, независимые от необязательных source-программ. Host должен реализовать транспорт по явной связи и не интерпретировать скачок координат как шаг через стены. Native findPath, findTilePath и findMovementPath учитывают транспорт: соседние элементы пути могут быть не соседними клетками. stepWalkthrough принимает {type:'travel',id:transportLink.id}. Проверка остаётся клеточной, без доказательства физики стороннего движка.

В каталоге всех режимов есть portal, lift, stairs с properties.transport = {kind,bidirectional,travelCost}. Свойства определения задают вид и параметры по умолчанию. Конкретные пары хранятся в project.transitions, ссылаются на ID двух источников и в интерфейсе выбираются кликами по карте. Ссылок на внешние карты здесь нет. Обязательные переходы основы защищены и редактируются настройками генерации; авторские связи добавляются отдельно.

## Авторские связи точек

`project.transitions` — необязательный массив, отсутствие означает отсутствие авторских связей в проекте формата 4. Новая основа содержит пустой массив. Его элемент:

```json
{
  "id": "link-some-id",
  "kind": "teleport",
  "fromSourceId": "portal-a",
  "toSourceId": "portal-b",
  "bidirectional": true,
  "travelCost": 1
}
```

kind: teleport/lift/stairs; до 128 связей, при общем лимите 256 источников. Одна точка участвует максимум в одной авторской паре. Концы обязаны иметь одинаковый kind. Стоимость — конечное число 0–100000; направление по умолчанию берётся из определения первой точки, затем true. Циклические пары, случайные источники и внешние карты не поддерживаются этой моделью. Отсутствующие ID, повторные ID, связь на себя, занятое назначение и некорректные значения отклоняются.

Точка — включённый objects/spawner с radius0, одной scatter-правилом, одним catalogId, chance1, quantity count1, schedule load/once/delay0, conditions any без flags, без общей populationId. Определение не должно блокировать движение. Во время connect проверяются полный габарит, ограничения каталога/правила, занятость и навигация; обе программы закрепляются как manual. Повторный connect от занятой первой точки заменяет только её пару. Прежняя вторая точка остаётся, чужая занятая цель не перехватывается. source.remove удаляет связи этой точки. Изменение условий source.put или каталога может сделать черновик невалидным: validate объяснит ошибку, runtime-экспорт откажется её пропускать.

```js
project = await editProject(project, {
  type: 'transport.connect', fromSourceId: 'portal-a',
  target: { layerId: 'upper', x: 12, y: 8 }, // реальная допустимая клетка
  bidirectional: true, travelCost: 2
});
// Либо toSourceId: 'portal-b' вместо target.
const checked = await validateProject(project);
console.log(checked.transitions); // {ok,reports:[{id,from,to,ok,errors,...}]}
```

Исполняемый пример, который ищет реальные допустимые клетки: [linked-transports.mjs](../examples/linked-transports.mjs). Выполнение `node examples/linked-transports.mjs evidence` записывает проект, runtime, подтверждённый state и результат разрешения перехода.

`resolveTransitions(project)` возвращает авторские связи с origin editor и полными from/to `{sourceId,catalogId,layerId,x,y,name,footprint}`. `nativeTransitions(project,layers)` возвращает нормализованные переходы основы для общего отображения, origin base. Сохранённые native данные не изменяются. `runtime.links` содержит исходные связи провайдеров и разрешённые авторские связи origin editor. `runtime.navigation` сохраняет модель native-провайдера: для авторских переходов host дополняет её из runtime.links. Новые сущности не запекаются в fixtures и initialState.

Валидатор связывает физические компоненты и явные пары между уровнями; проверяет доступ от глобального входа карты и путь назад. Односторонняя связь допустима, если есть иной маршрут возврата. В sideview используются устойчивые безопасные опоры полного габарита героя и физические рёбра с доступными способностями; native-валидатор независимо проверяет порядок получения способностей. Связь не скрывает испорченную основную геометрию. Бюджет sideview — 6000 физических опор, общий граф — до 300000 узлов, Worker до 60 секунд.

В живом приложении source-программы обоих концов должны быть фактически исполнены и подтверждены. Используйте app-функцию:

```js
import {resolveTransition} from './VlandGenerator/app/index.mjs';
const hop = resolveTransition(runtime, state, link.id, link.fromSourceId);
if (hop.ok && host.canArrive(hop.destination)) host.travel(hop);
```

Готовность проверяется по подтверждённым entity.origin.sourceId, catalogId, layerId и координатам; отключённая или отсутствующая точка даёт `{ok:false,code:'NOT_READY',reason}`. Обратный проход по односторонней связи даёт DIRECTION. Неверный runtime/state или неизвестная связь — ошибка. Функция не перемещает игрока и не изменяет state: host проверяет свой габарит/живые препятствия и применяет стоимость. Helper разрешает только авторские связи; обязательные native-переходы host исполняет по данным провайдера. То же доступно POST api/transition-resolve и `node cli.mjs transition-resolve job.json result.json`.

Распределение sources строго ограничено template.category, template.kind, groupId и layerIds одновременно. Автоматические ID включают категорию и вид, поэтому повторное имя группы не приводит к коллизии между категориями. Seed template.seed независим от recipe.seed и не меняет основу. Применяйте distribution-preview → distribution-apply; сохраняйте manual и недобор. Сброс UI меняет только черновые настройки выбранной категории, а не проект.

## Геометрический штрих и PNG

```js
const next = await editProject(project, {
  type: 'terrain.stroke', layerId: 'surface', field: 'water', value: 'river',
  cells: [{x: 10, y: 8}, {x: 11, y: 8}]
});
```

field: material / biome / water / elevation / fertility / waterDepth. Для material значение — ID из SURFACES; необязательный trait normal/fertile/poisoned/frozen/burnt задаёт свойство поверхности; для water — none/sea/river/lake/groundwater/lava; числовые поля 0–1. Штрих 1–16000 клеток, итог до 32000 overrides. Защищённая клетка отклоняет весь геометрический штрих. Изменение воды синхронизирует физическое поле; source не изменяется. Для biome явная правка очищает secondaryBiome до пустой строки и transitionStrength до0 только в изменённых клетках материализованного слоя, включая назначение прежнего значения. Это не пересчёт соседей, landform, материалов, стока или климата. Отмена либо reset-edits восстанавливают поля основы при отсутствии соответствующего override; импортируемый source остаётся неизменным. Штрих не создаёт sources и не меняет соседние категории. Для произвольного редактирования повторяйте validateProject перед exportRuntime; небезопасное состояние нельзя выдавать как проверенное.

```js
import {execute, materialize, exportLayerImages} from './VlandGenerator/app/index.mjs';
const images = await execute('raster-export', {
  project,
  options: {scope: 'all', channel: 'material', scale: 4, transparent: true}
});
const current = exportLayerImages(await materialize(project), {
  scope: 'current', layerId: 'surface', channel: 'biome', scale: 2
});
```

POST `/api/raster-export` принимает тот же объект. `vland.raster/4` содержит colorMode RGBA8, files [{name,layerId,width,height,mime,encoding:'base64',data}]. Каждый слой — самостоятельный PNG color type6, RGB8+alpha8, без UI/содержимого. scope current/all; channel material/biome/water/elevation/fertility/temperature/humidity/drainage/transition; scale целое 1–16. До 16 млн выходных пикселей на слой, в том числе с учётом формы гексагона; JSON API — до 16 MiB PNG суммарно. После проверки параметров точный размер текущего кодирования вычисляется для всех выбранных слоёв до чтения клеток и выделения растровой памяти. Превышение даёт прежний ERROR / HTTP400 / CLIexit1, без частичного результата. Для большого заказа уменьшайте масштаб или выгружайте слои отдельно.  Канал «Высота» использует общую монотонную кривую v^2.4 перед переводом в цвет: разница высоких горных отметок заметнее в редакторе и PNG. Это отображение; elevation, сток и навигация не изменяются. Browser UI может писать PNG напрямую в выбранные file handles: там действует пиксельный лимит, суммарный лимит JSON API не применяется.

POST `/api/diagnose` с {project} и execute('diagnose',{project}) возвращают независимые отчёты геометрических областей, площадей, материалов, воды и биомов. Геометрический компонент не доказывает проходимость конкретного тела.

CLI: `node cli.mjs raster-export raster-job.json images.json`, `node cli.mjs diagnose project-job.json report.json`. Оба job содержат project; raster-job дополнительно options.

## Новые параметры генерации

Данж: generation.layout.corridors {minLength:1,maxLength:3,preferredLength:2,openWidth:1}. Проверяется 1 ≤ min ≤ preferred ≤ max ≤ 24, ширина 1–3. Двери в длину не входят. Ширина относится к открытым проходам; контролируемые проходы имеют горло 1. Ярусы: generation.layers[i].request.layout.corridors. layout.architecture: organic/compact/gallery/clustered/ring. Явные поля имеют приоритет над исходными значениями профиля; при заказе только профиля можно опустить preset/corridors. Ширина/длина входят в геометрию и семантическую проверку, без скрытого ограничения до 3.

Природные режимы: mode:'landscape' принимает только generation.topology:{kind:'square'}, mode:'hexlandscape' — только {kind:'hex'}. createRecipe и GET /api/defaults возвращают соответствующую сетку. У caves/relief сохраняется выбор square/hex. Генерация и импорт отвергают противоречие mode и topology, включая сетку native request и слоёв. Новый hexlandscape — самостоятельный режим, без алиаса или преобразования прежних landscape-hex проектов. Для нового заказа используйте createRecipe('hexlandscape'); не переименовывайте mode/source/checksum готового проекта вручную. Native atlas остаётся общим и поддерживает обе сетки. Hex — pointy-top, odd-r; шаг, радиусы, связность и экспорт используют 6 соседей. footprint width×height по-прежнему означает прямоугольную маску offset-строк, без автоматического поворота.

Стороны native atlas и природных app-режимов16–300, суммарно `width*height*(1+above+underground)<=98304`. Размеры50/100/200/300 не требуют отдельного поля scale; width/height301 отклоняются.300×300=90 000 клеток допускает только одну поверхность; caves с обязательным подземным слоем при таком размере превышает бюджет. Ошибка не уменьшает размеры/слои автоматически. Пределы native-схем: массивы98304, клеточные индексы98303, drainage98304, coastDistance600; геометрические и байтовые бюджеты экспорта проверяются отдельно.

- Без нового landscape-профиля: landforms {pattern:'natural',direction:0,strength:0.45,featureScale:1,coastDetail:0.25}; pattern natural/island/archipelago/ridge/plateau/basin; direction 0–359, strength/coastDetail 0–1, featureScale 0.3–4.
- biomes {transitionWidth:3,coastWidth:2,foothillWidth:3}; диапазоны соответственно 0–12/0–8/0–8 клеток. Поля coastDistance,landform,salinity,floodRisk,secondaryBiome,transitionStrength экспортируются независимо от основного biome. transitionWidth — максимальное число клеток с каждой стороны совместимой границы, а не общая ширина полосы. В Surface-профиле transitionWidth ограничивает именованные переходные зоны между территориями; при0 эти зоны отключены. Целые кольца перехода занимают не более35% площади соответствующего территориального типа; beach/gravel-shore/rocky-coast/floodplain/cliffs сохраняются. secondaryBiome/transitionStrength — данные соседнего контекста, не команда RGB-смешивания; allowedBiomes проверяет фактический основной biome.
- hydrology дополняется riverWidth 1–5, minLakeArea 1–128, floodplainWidth 0–8. В ветке с landscape-профилем riverWidth=1 означает ядро без автоматической дополнительной кромки; приN расширение ограничено N−1 кольцами соседей и условиями высот/накопления стока. Сохранённые море/озёра не заменяются расширением. minLakeArea фильтрует связные озёрные компоненты до выделения окончательного русла; выбранная речная цепь продолжается через удалённую малую впадину до моря/границы/слияния. rivers=0 не создаёт такие русла. Без профиля native-путь сохраняет собственный порядок алгоритма.
- caves.style mixed/chambers/tunnels/karst/fractured/lava-tubes/shafts/water-carved; tunnelRadius 1–4, branching 0–1, smoothing 0–5.

## Профиль основы ландшафта

Контракт профиля для landscape/hexlandscape — `generation.landscape:{structure,baseBiome,biomes?,landPercent?,coastErosion?,uniformity?}`. Обязательны structure/baseBiome; отсутствие biomes означает пустой список. Новые рецепты содержат `{structure:'land',baseBiome:'meadow',biomes:[],landPercent:75,coastErosion:50,uniformity:50}`. Прежнее additionalBiomes не принимается; преобразований нет. Дополнительный биом «Гравий» (type:gravel, biome:gravel, material:gravel, #9c9989) доступен в карточках обеих ландшафтных сеток. Его доля учитывается в общем бюджете100% сухих территорий; правила подтверждения и автоматической генерации общие. Семь базовых биомов сохраняются. Гравий не изменяет геологическую маску моря и выбранную долю суши.

| Поле | Допустимые значения |
| --- | --- |
| structure | land, coast, islands, continent |
| baseBiome | meadow, forest, swamp, desert, snow, mountains, volcanic |
| landPercent | Целое1–99, default75; применяется к coast/islands/continent |
| coastErosion | Целое0–100, default50; изрезанность берега coast/islands/continent. При0: ровный берег coast, гладкие отдельные острова islands, округлённый прямоугольник continent. При100: нерегулярные бухты, заливы и выступы; точная квота суши и связность сохраняются. Для land не влияет |
| uniformity | Целое0–100, default50; совместное географическое распределение биомов, рельефа и истоков |
| biomes | До64 карточек `{id,type,percent}` в заданном порядке |
| id | Уникальная непустая строка до64символов, стабильная при редактировании |
| type | Любой из7ID baseBiome, повторы разрешены |
| percent | Конечное число0–100 с точностью0.1; сумма всех карточек<=100 |

Нормализация добавляет landPercent75, coastErosion50 и uniformity50 при отсутствии полей. Для трёх морских основ геометрическая суша занимает ровно round(width*height*landPercent/100) клеток; внутренние реки и озёра входят в этот массив, море — остаток. land не создаёт моря независимо от сохранённого landPercent. Это отличается от сухой площади для процентов карточек ниже. В islands seed выбирает расположение, пропорции и крупные изгибы трёх островов; обязательной центральной трёхлучевой схемы нет. Параллельные вытянутые полосы — редкое семейство с порогом выбора2% по seed, без отдельного поля API. Морские проливы имеют узкие и широкие участки, число береговых входов не фиксировано; это не число freshwater-русел и не новое поле API. Морская рамка и три раздельных острова ограничивают допустимую долю на малых размерах; невозможный запрос возвращает ошибку, без скрытого изменения процента. Uniformity0 укрупняет природные провинции и концентрирует подходящие водосборы,100 распределяет их более разнесённо,50 задаёт умеренный масштаб. Параметр не меняет квоты моря/биомов, не включает отключённые реки и не заменяет водосбор случайными руслами.

«＋ Добавить биом» создаёт отдельный сворачиваемый черновик с типом и процентом суши. В расчёт входят только карточки, подтверждённые внутренней кнопкой «Добавить»; успешное подтверждение сразу создаёт карту с новым составом. Начальная доля новой карточки25% или доступный остаток, если он меньше. Редактор ограничивает долю так, чтобы подтверждённые карточки и другие открытые черновики не занимали больше100%; десятичный остаток сохраняется с шагом0.1. Типы можно повторять, в том числе основной; максимум64 блока. Проценты0–100 с шагом0.1, сумма не выше100%; основной биом заполняет остаток. Нулевая карточка не занимает площадь. Удаление возвращает её долю основному. Суша для расчёта — клетки без моря, озёр и русел после гидрологии, до маршрутных ремонтов и ручных правок; доли округляются до клеток методом крупнейших остатков. Доля описывает территорию биома вместе с местными берегами, поймами, скалами и другими природными подтипами, а не точный процент одного цвета или tileID.

```js
recipe.generation.landscape={structure:'continent',baseBiome:'mountains',biomes:[
  {id:'forest-west',type:'forest',percent:25},
  {id:'forest-east',type:'forest',percent:15},
  {id:'lowlands',type:'swamp',percent:10}
]};
```

Нормализация клонирует данные, сохраняет порядок и ID, проверяет уникальность ID и сумму; не уменьшает доли и не выбирает типы автоматически. JSON Schema проверяет форму/числовые границы, семантический нормализатор также проверяет сумму и уникальность ID. Другие app-режимы caves/relief профиль не принимают.

Поверхность строится по многоуровневым полям Surface: крупная география, региональные и местные высоты, эрозия, вода/водосбор, климат, затем территории и природные переходы. Изменение карточек не меняет высоты/воду. Локальные подтипы не являются дополнительными автоматически выбранными карточками. Для allowedBiomes используйте фактические ID клеток (plains/wetland/alpine и т.д.).

`POST /api/landscape-rebuild`, `execute('landscape-rebuild',{project,recipe})` и `node cli.mjs landscape-rebuild job.json result.json` выполняют один атомарный пересчёт существующей карты. Требуются те же mode/seed и все generation-настройки кроме landscape. Ответ — новый vland.project/4 с revision+1 и сохранёнными catalog/sources/transitions/edits. `REBUILD_SETTINGS_CONFLICT` означает другие неприменённые настройки; `REBUILD_CONFLICT` — несовместимость ручных данных с кандидатом. Исходный проект и именованный файл не изменяются. Схема задания: schemas/landscape-rebuild-request.schema.json. Обычный generate-base по-прежнему создаёт чистый проект. В интерфейсе внутренняя кнопка «Добавить» подтверждает новую карточку или изменённый тип. Новая карточка до подтверждения не попадает в recipe. Доля активной карточки фиксируется по change/Enter и сразу вызывает generate-base; её незавершённый тип при этом не подтверждается. Промежуточный набор числа не меняет активную долю. Неподтверждённые поля относятся только к UI-сессии; в API/schema дополнительных полей подтверждения нет. Успешная внутренняя «Добавить» сразу запускает generate-base, включая первый запуск без готовой карты. Удаление активной карточки тоже сразу запускает generate-base, включая последнюю карточку. Смена базового биома немедленно запускает generate-base с сохранённым подтверждённым списком карточек; UI-черновики сохраняются отдельно. Ввод, создание и удаление неподтверждённого черновика генерацию не запускают. landscape-rebuild остаётся отдельной программной операцией.

## Природные автоматические переходы

В landscape/hexlandscape/caves/relief используется собственный generation.autoTransports:

```json
{"enabled":true,"connectRegions":true,"crossLayerRegions":true,"minRegionArea":32,"maxLinks":128,"landingSize":1,"travelCost":2,"types":{"teleport":1,"lift":1,"stairs":1}}
```

Это другой контракт, чем изоляция dungeon/tiers. minRegionArea 4–4096, maxLinks 1–128 на всю карту, landingSize 1–3, travelCost 1–1000, веса 0–100 с хотя бы одним положительным. Частичный types обнуляет пропущенные виды. Без crossLayerRegions для локальных областей необходим разрешённый телепорт. Лимит включает обязательную цепочку уровней. Если площадка/вид не подходит, выдаётся ошибка, а не вымышленная связь.

source.automaticTransports {settings,groups,counts,ignoredSmallRegions}, source.access {ok,errors,significantRegions,accessibleRegions,links}. Проверка независимо доказывает реальные площадки, доступ от глобального spawn и возврат, включая воду, опору, габарит и maxStep. Группы ниже порога не обещаются доступными. Native fixtures и runtime.links содержат обязательные переходы; runtime.initialState.entities остаётся пустым. Авторские пары sources исполняются отдельно, как описано выше.

## Поселения

mode:'settlements', страница Web/HTML/settlements.html. generation: cityPercent5–100/default60 (town only), width/height32–300, type town/village, pattern organic/grid/radial/ribbon, blockSize — шаг основных улиц8–24, streetWidth — ширина основных улиц/дорог1–4; второстепенные деревенские дороги шириной1. Для village/organic дорожная петля ограничивает центральный план; лесная окраина не подразделяется искусственно, фактические внешние faces остаются в planning.unassigned при несоответствии диапазону. terrain.water0–0.8 задаёт долю воды речной долины,0 оставляет сухой план; terrain.relief0–1 сохраняет рельеф. autoTransports:{enabled:false}; один квадратный физический слой. Город: улицы, речные мосты, площади, парки, река и озеро. Деревня: дороги, речные мосты, леса и луга, без площадей и парков. Новая генерация не размещает дома: parcels:[]. buildingDensity0–1 остаётся допустимым полем текущего контракта, default0, но не влияет на план без домов; в UI его нет. Парки/площади — fields.biome park/square с материалом grass/gravel, общей легендой и цветами PNG. Категории содержимого не заполняются. Весь габарит дорог обходит озёра и скалы; мост сохраняет river под настилом и соединяет высоты берегов. Если подходящего пути нет, улица заканчивается на доступной суше.

`source.streets` и `runtime.navigation[].streets`: `{id,rank,from,to,width,path}`. `path` — фактический последовательный путь по клеткам, включая обходы; `from/to` совпадают с его концами. `rank`: primary/secondary/access/alley/pier. В `source.atlas.layers[].fields.road`: пустая строка/trail/bridge/pier; bridge — только речная клетка, pier — морская. Бит `fields.bridge` обозначает опору настила над водой и установлен также у пирса. Не определяйте вид водоёма по этому биту; читайте waterType и road. Координаты путей — якоря квадратного габарита width×width вправо и вниз. В native validator проверяются покрытие клеток планом, доступность, уступы, препятствия и ограничения воды независимо от fingerprint. Геометрия дорог и открытых пространств детерминирована seed; адаптер не должен интерполировать from→to по прямой.


Низкоуровневый engine/api/index.mjs экспортирует generateSettlement, normalizeSettlement, validateSettlement; native schema vland.settlement/1 содержит request, atlas, streets, parcels, spawn/exit и fingerprint. App-проект и runtime используют обычный публичный контракт 4. Заявленные двери проверяются фактической моделью движения. Экономика/история/жители не симулируются. Настройка cityPercent5–100 (по умолчанию60), «Площадь городского плана, %», ограничивает габарит улиц долей внутренней области карты, с округлением до клеток и минимальной стороной6. План выбирает более пригодную сухую область; вода и скалы сохраняются, поэтому фактическая городская суша может занимать меньше. При100 используется полный доступный габарит. В деревне настройка не применяется и скрыта. Второстепенные улицы города шириной1; streetWidth задаёт основные улицы. Площади и парки выбираются только из компактных микрорайонов, не из planning.unassigned: узкие берега и большие незапланированные территории остаются природными. Площадям отводится до1,5% габарита плана (для небольшой карты бюджет не менее144 клеток), паркам — до6% (минимальный бюджет144); целые участки должны помещаться в бюджет.

## Временная рабочая сессия интерфейса

Локальные POST /api/session/open|save|heartbeat|release обслуживают один .run/working-session.json. Это временный UI-контракт vland.working-session/1, не замена экспорту проектов. open принимает clientId/pageId/sessionId/resume/mode (либо null для страницы без редактора), возвращает идентификатор сессии, clientId и только workspace текущего режима. settings — служебный workspace общих настроек. save принимает эти идентификаторы, mode, возрастающий sequence и workspace {recipe,project,ui,fileId,fileRevision,dirty,pending}. При неизменном project можно передать projectChecksum вместо project. Запоздавшие sequence не перезаписывают новые; pageId защищает от запоздавшего pagehide предыдущей страницы.

Вкладки имеют отдельные sessionStorage ID; дублированная вкладка получает новый ID. После закрытия всех клиентов новое открытие очищает старую рабочую сессию. WebSocket /api/session/presence с query sessionId/clientId/pageId отслеживает живую страницу; разрыв соединения освобождает только её актуального владельца. Канал принимает только служебные close/ping/pong, данные карты не передаются, Origin и идентификаторы проверяются. Это отдельное обновлённое соединение, оно не занимает лимит обычных HTTP-запросов вкладок. При недоступности соединения резервный клиент истекает за 120 секунд; сервер не читает прошлую сессию после перезапуска. Ограничения: 16 вкладок, 24 MiB/workspace, 64 MiB/файл. Запись последовательная, через один постоянный .tmp и atomic rename. Датированных файлов и скрытых project-save копий нет. При превышении лимита старый файл сохраняется, возвращается SESSION_FULL. Явные projects/*.json и их проверка ревизии не меняются.

## Расположение веб-интерфейса

Файлы интерфейса находятся в `Web/index.html`, `Web/HTML/*.html` и `Web/HTML/ui/`. HTTP API сохраняет корневой префикс `/api/`; вложенность страницы не меняет адреса методов, сохранений и WebSocket presence. JS API через app/content/engine и CLI остаются в корне проекта. Поле `MODES[mode].page` содержит имя HTML-файла редактора; его веб-адрес — `/Web/HTML/` плюс это имя.

## Палитра отображения PNG

options.palette у raster-export — объект с необязательными разделами material, biome, water. В каждом разделe ключ — точный ID из каталога, значение — #RRGGBB. Пример: {"palette":{"material":{"grass":"#808080","rock":"#abcdef"},"water":{"river":"#559fb0"}}}. Проверка — schemas/display-palette.schema.json. Неизвестные разделы/ID и некорректные цвета отклоняются. JS exportLayerImages, HTTP /api/raster-export и CLI raster-export принимают одинаковую опцию; без palette используются стандартные цвета. Браузер передаёт свою схему при PNG-экспорте. HTTP/CLI не читают браузерное хранилище: для такой же картинки передавайте palette явно. Формат результата vland.raster/4 и формат проекта не расширены.

app/raster.mjs: cellColor(layer,index,channel,palette), rasterizeLayer(layer,{channel,scale,transparent,palette}). Пользовательский RGB основного элемента имеет точный приоритет над оттенками, смешиванием и затемнением. Стандартные природные клетки с согласованными biome/material используют дискретный цвет фактического biome, включая вид material. Луга имеют #78955c, forest/taiga/rainforest — общий #466f49; обычный плодородный грунт не добавляет зелёные оттенки. Вторичный контекст secondaryBiome/transitionStrength не смешивает RGB. Переходные зоны используют цвета их фактических ID (beach/foothills/floodplain/tundra/savanna/badlands и т.д.). Явная перекраска материала имеет приоритет; ручные материалы и особые свойства poisoned/frozen/burnt сохраняют своё отображение. Прозрачность PNG по-прежнему зависит от геометрии и параметра transparent. Цвет не меняет навигацию или сущности.

## Форматирование JSON-вывода

UI-download и CLI используют app/json-export.mjs: serializeDocument(value). До1 МиБ компактного UTF-8 включительно — JSON с отступами2, если отступы укладываются в бюджет выбранного документа; иначе компактный JSON. Recipe ограничен1MiB, project/runtime24MiB, llm-context128KiB. Обычно добавляется LF; ровно на границе бюджета LF опускается, чтобы экспорт оставался импортируемым. Это только whitespace, ключи/значения/schema/checksum прежние. HTTP и серверные именованные проекты уже используют компактное представление. Для больших CLI-результатов предпочтителен аргумент файла вместо ограниченного stdout-буфера внешнего процесса.

## Индивидуальные физические слои природных карт

Опциональное generation.layerSettings (landscape/hexlandscape/caves) и native atlas request.layerSettings — объект с ключами cave-1…cave-6 существующих подземных срезов. Значение: {depth?:8..768 integer,caves?:{style,openness,connectivity,aquifers,lavaDepth,tunnelRadius,branching,smoothing}}. Параметры caves имеют те же диапазоны, что общие caves; неизвестные поля/слои отклоняются. Отсутствующие значения наследуют общий профиль. Без depth используется индекс × layers.depthStep; итоговые глубины строго возрастают. z отрицателен, поверхность z=0. Эти настройки сохраняются в recipe и исходном request; несовпадение требует пересоздания основы.

Пример generation.layerSettings: {"cave-1":{"depth":16,"caves":{"style":"karst","aquifers":0}},"cave-2":{"depth":64,"caves":{"style":"lava-tubes"}}}. При layers.underground=2 получаются z=0,-16,-64. Уровень моря в карте высот нормирован; z — отдельная условная вертикальная координата. Схемы: generation-landscape/generation-hexlandscape/generation-caves и engine/atlas-request.

## Тип relief

mode:"relief" использует generation-relief.schema.json и provider app/modes/relief.mjs. generation описывает одну поверхность: layers.above=0 и layers.underground=0; ненулевые физические срезы и layerSettings отклоняются. Другие параметры совпадают с общим природным генератором; relief сохраняет выбор square/hex. Геометрия — native vland.atlas, публичные recipe/project/runtime остаются schema4. Отображение elevation — настройка страницы, не отдельное поле проекта. Все операции содержимого, редактирования и экспорта общие.

mode:"hexlandscape" использует generation-hexlandscape.schema.json и страницу Web/HTML/hexlandscape.html. mode:"landscape" использует generation-landscape.schema.json и Web/HTML/landscape.html. Программный контракт обоих режимов поддерживает layers/layerSettings и общий редактор; UI создания ландшафта предлагает одну поверхность без добавления физических слоёв. Импортированные готовые слои показываются отдельными сворачиваемыми картами. Экспорт сохраняет точный mode и topology. При экспорте llm-context в context.project.landscape включается копия recipe.generation.landscape, включая biomes, если профиль есть в рецепте. Поле необязательно: отсутствие профиля не заменяется выдуманным значением по сводке; для полной информации читайте project или recipe.

Индивидуальные z/depth не меняют единицу native deposit.depth: это целый индекс подземного среза (0–6), а не отношение пользовательской глубины к общему шагу. Геометрическая глубина задаётся z; минеральные правила используют индекс среза.


### Площади поселения

`generation.neighborhoods:{minArea,maxArea}` и `generation.quarters:{minArea,maxArea}`: целые4–25600, min≤max; квартал должен вмещать минимум два микрорайона (`quarters.maxArea >= 2*neighborhoods.minArea`). Значения по умолчанию36–144 и144–576. `blockSize` задаёт исходный шаг улиц, а не площадь квартала. Все параметры доступны в формах, JS, HTTP, CLI и generation schema.

Площадь — число клеток суши без дорог, включая парки и площади. Микрорайон — связный участок между улицами и границами рельефа; слишком крупные участки делятся дополнительными улицами. Квартал объединяет минимум два соседних микрорайона через сухие улицы; речные переходы не объединяют кварталы. Группировка детерминирована, оптимальная глобальная упаковка площадей не обещается.

`source.neighborhoods[]:{id,area,cells,bounds}`, где cells — row-major индексы по ширине atlas-слоя; `quarters[]:{id,area,neighborhoodIds}`. Площадь квартала — сумма площадей его микрорайонов; дороги в сумму не входят. `planning:{areaUnit:'land-cells-without-streets',unassigned:[{reason:'below-minimum'|'above-maximum',area,cells}],ungroupedNeighborhoodIds:[]}` явно сообщает недобор. Подходящая площадь не гарантируется на любом рельефе; неклассифицированные участки не выдаются за соответствующие настройкам. Валидатор заново выводит разбиение из геометрии и проверяет членство/площади независимо от checksum.

Метаданные передаются через materialize и `runtime.navigation[]`. Это план неизменяемой основы. Ручные terrain-правки не пересчитывают кварталы; принимающее приложение решает, когда ему строить новый план. UI показывает границы и М/К, имеет переключатель видимости и сворачиваемый отчёт площадей/недобора. PNG по-прежнему содержит выбранное поле геометрии; подписи и контуры плана относятся к UI.


## Явные форматы экспорта и контекст LLM

`exportDocument({project,format,options?})` или `execute('export',job)`, `POST /api/export`, `node cli.mjs export export-job.json [document.json]` используют один код. `format` обязателен и должен быть строкой: `project`, `recipe`, `runtime`, `llm-context`. Массивы (включая `["project"]`), объекты, null, числа и boolean не преобразуются в строку: неверный тип/формат даёт INVALID_EXPORT / HTTP400. CLI завершается с кодом1 и не перезаписывает выходной файл при таком отказе. Схема запроса — [export-request.schema.json](../schemas/export-request.schema.json). Возвращается сам документ выбранного вида; обёртки и автоматического сохранения файла проекта нет.

- project — точный редактируемый schema4 проект с основой, источниками, переходами и правками; пригоден для import. Возвращается независимая копия.
- recipe — параметры новой генерации и актуальный каталог, проверенные normalizeRecipe перед выдачей. Если расширенный каталог превышает1MiB рецепта, экспорт возвращает TOO_LARGE; полный проект остаётся экспортируемым в своём бюджете24MiB. Ручные правки/источники не входят; повторная генерация не восстанавливает их.
- runtime — проверенная сцена, навигация, источники и initialState, как exportRuntime. Невалидная карта отклоняется до экспорта.
- llm-context — vland.project.context/4, только сводка. Его нельзя импортировать как проект/recipe/runtime. [Схема](../schemas/project-context.schema.json).

`options` допускаются только для llm-context: `layerIds` — 1–16 разных реальных ID, `maxSources` (по умолчанию32), `maxCatalog` (48), `maxLinks` (32); каждый лимит0–256. Неизвестные/повторные layerIds, неизвестные options и отрицательные лимиты отвергаются. Слои выводятся в исходном порядке. Источники ограничены выбранными слоями, связи включают пересечения с выбранными слоями и могут вести на слой вне выборки. Каталог остаётся общим.

Контекст содержит identity проекта (checksum/revision/seed/hash исходника), реальные ID, размеры/топологию/точки входа-выхода, агрегаты актуальной геометрии с правками, краткие сведения о каталоге/источниках/связях и validation. `project.sourceFingerprint` — hash всего native source, а не подпись подлинности. `project.revision` — числовая ревизия содержимого; expectedRevision именованного файла — отдельный SHA файла. Не подставляйте одну вместо другой.

Нет массивов клеток, RLE-масок, свойств каталога и полных программ правил. `area.cells` зоны — площадь её маски, не число пригодных позиций; bounds не доказывают совместимость. allowedEnvironments=[] в сводке означает отсутствие ограничения по этому списку; остальные constraints требуется читать из проекта. Для решения о размещении используйте source-preview/distribution-preview и полные constraints. Проверка навигации остаётся клеточной.

Каждый inventory сообщает total/ids/entries/omittedIds/omittedEntries; гистограммы — counts и omittedKinds. Включённый источник перечисляет максимум16 catalogIds; omittedCatalogIds считает остальные уникальные ссылки его правил. Validation содержит максимум10 ошибок и10 предупреждений по256 символов JS: omittedErrors/omittedWarnings считают целиком пропущенные сообщения, shortenedErrors/shortenedWarnings — укороченные сообщения среди включённых. budget.truncated=true при любом из этих сокращений, пропусках inventory или видов гистограмм; false не означает, что сводка заменяет полный проект. Ничего не подменяется выдуманными ID. Максимум128KiB компактного UTF-8 JSON с LF при скачивании; budget.bytes — размер компактного JSON без финального LF. При переполнении уменьшаются подробные entries, затем гистограммы и при необходимости списки ID; пропуски явно считаются. Метаданные детерминированы, времени создания нет. Уменьшайте выборку слоёв или читайте полный проект для полного описания. В context возвращается validation.ok=false для корректного проекта с ошибками редактированной навигации; такая сводка помогает диагностике, не разрешает runtime-export.

Публичные raster-export и diagnose проверяют проект через importProject до чтения слоёв: schema4, checksum, native-основу и структуру сцены/источников. Повреждённый checksum даёт CHECKSUM_MISMATCH / HTTP400 / CLIexit1 без перезаписи выходного файла. Ошибка проходимости от авторских правок сама по себе не блокирует эти операции: изображение и геометрический отчёт остаются доступны для исправления; runtime-export по-прежнему требует validation.ok.

`GET /api/contract` и `execute('contract')` содержат operationDetails: method/path, required/optional поля канонического JSON-задания, result и effect (read-only/returns-project/returns-state). Для export указан requestSchema; exportFormats описывает назначение/схему каждого формата. validate возвращает отчёт с ok, а не гарантирует успех по одному HTTP200. commitSpawnPlan без options.acceptedIds подтверждает все предложенные команды; host должен явно передать только реально созданные ID.

В UI все форматы идут через ту же Worker-операцию. Неприменённые настройки новой генерации остаются черновиком; экспорт описывает текущий созданный проект. Именованные файлы сохраняются только явно, с прежней проверкой ревизии. Контекст/кнопка экспорта не обращаются к внешнему AI и не требуют ключей.

Страница режима caves называется «Чанк» и открывается по Web/HTML/chunk.html. Идентификатор mode:caves, схемы и команды API сохранены. Интерфейс обоих ландшафтов предлагает одну поверхность без создания физических слоёв; layers/layerSettings программного контракта и импорт готовых многослойных документов сохранены.

Числовые поля интерфейса сохраняют промежуточный набор, а при подтверждении/выходе из поля ограничивают значение своими min/max и шагом; пустое обязательное значение не запускает генерацию. API не исправляет недопустимые значения молча: типы, диапазоны и шаги проверяются строго. Автоматическая межслойная цепочка выбирается только из разрешённых stairs/lift; при нулевых весах обоих типов и необходимых слоях запрос отклоняется. Телепорты остаются внутри одного физического слоя.

 Мелководье (biome:shallow-water, #65b7bd) автоматически выделяется только в морской воде обеих ландшафтных сеток: глубина <=0.075+0.045*exp(-max(0,d-1)/L), где d — расстояние в шагах соответствующей сетки до сухой клетки, L=max(1,0.025*min(width,height)); глубина нормирована0–1. Прибрежный порог плавно снижается с0.12 до0.075 вдали от суши. Поэтому мелкая подводная отмель распознаётся и вдали от берега, а глубокая вода у скалы остаётся глубокой. В карточки наземных биомов оно не входит. waterType=sea, waterDepth, дно, проходность и доля суши сохраняются; цвет и название общие для редактора, легенды и PNG, biome сохраняется в runtime.
