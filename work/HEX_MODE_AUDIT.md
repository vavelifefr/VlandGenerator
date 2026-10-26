# Отдельный гексагональный ландшафт — аудит внедрения

Read-only аудит20.10.2026. Рабочие исходники, проекты, examples/fixtures, .run, серверы и вкладки не изменялись. Предлагаемое каноническое имя: `hexlandscape`, страница `Web/HTML/hexlandscape.html`, подпись «Гексагональный ландшафт». Это новый самостоятельный режим, не алиас `landscape`.

## Минимальная реализация и основные ловушки

1. Общий природный provider/helper с build/validate/layers оставить независимым от режима и topology. Сейчас app/modes/caves.mjs:2 re-export из landscape, а app/modes/relief.mjs:1 вызывает landscape. Поэтому square-only проверку нельзя просто добавить в существующий общий build/validate: это сломает caves/relief hex вне поручения. Либо вынести текущие3функции в общий helper, либо экспортировать явно именованные общие функции из landscape и перенаправить на них caves/relief; отдельные provider-обёртки должны проверять свой square/hex. Первый вариант яснее.
2. Landscape defaults сохраняют square, hexlandscape получает независимый clone defaults с hex. Оба режима используют naturalLayers и тот же atlas engine; engine/core/topology, hydrology, navigation, renderer и content не форкать. Native atlas/atlas-request схемы остаются square/hex.
3. Проверять неверную topology и при генерации, и при импорте recipe/project, а не только скрыть UI select. app/project.mjs normalizeRecipe:22 выполняет structural checks, но не вызывает provider; importProject использует provider.validate. Поэтому отрицательные тесты нужны на оба пути: square-mode + hex request, hex-mode + square request, а также сохранённый source.request/layers противоположной topology. Не делать принудительное скрытое преобразование прежних landscape-hex документов.
4. controls.mjs:22 клонирует FIELDS.landscape в relief. Сначала сохранить общий набор для relief (и caves), затем убрать topology select только у landscape/hexlandscape. Иначе побочно исчезнет hex у relief. Аналогично builder клонирует generation-landscape в generation-relief (tools/build-evolution-schemas.mjs:11–12): relief-клон должен остаться topology-flexible, ограничения square/hex накладываются на независимые схемы режимов.
5. workbench.mjs:45 включает sandwich stack только для landscape. Добавить hexlandscape туда; stack уже использует MapCanvas и не содержит режима/алгоритма, так что отдельный stack не нужен.

## Карта рабочих файлов

| Область | Проверенное место | Что требуется |
|---|---|---|
| Реестр/provider | app/contracts.mjs:4,23,25 | MODES, lazy loader и API_CONTRACT.automaticTransports.natural.modes |
| Provider | app/modes/landscape.mjs:1; caves.mjs:2; relief.mjs:1 | Общий atlas helper и две mode-обёртки; caves/relief не ограничивать |
| Геометрия без implicit content | app/stages.mjs:22 | Включить hexlandscape в natural ветку buildBase, иначе native population не отключится |
| Проверка правок | app/navigation.mjs:10 | Включить в natural branch: физическая навигация после редактирования |
| Соответствие настроек source | app/generation-settings.mjs:11 | Включить в natural checks layerSettings/autoTransports; добавить topology identity при необходимости |
| Бюджет | app/generation-budget.mjs:3 | Включить в atlasSizeBudget, сохранить98304cells и256×256surface |
| Формы | Web/HTML/ui/controls.mjs:20–28,36 | Самостоятельный FIELDS, общий набор без topology для2landscape, enabled transport controls и budget note |
| Фасад нескольких карт | Web/HTML/ui/workbench.mjs:45 | Stack для обоих landscape; layerViews уже сериализуются на150 и восстанавливаются на160 |
| Контекст формы содержимого | Web/HTML/ui/constraint-model.mjs:18 | fallbackKinds для нового режима, иначе без карты пропадут surface/above/underground |
| Переходы меню | Web/HTML/ui/session.mjs:2 | Добавить hexlandscape.html в внутренние pages для сохранения перед навигацией |
| HTML | tools/build-pages.mjs:8–9 | Страница генерируется автоматически из MODES; обновить статическое «Семь генераторов» на актуальный count |
| Документные якоря | tools/build-docs.mjs:5 | Добавить подпись/anchor, когда новый раздел появится в USER_GUIDE |

Без отдельной правки: shell.mjs:5–6 строит меню по MODES; worker.mjs вызывает общий execute; tools/session-store.mjs:11 проверяет mode через MODES; app/catalog.mjs:36 defaultCatalog общая для всех; runtime/export берут recipe.mode и materialized layers. Не дублировать эти алгоритмы ради нового режима. Сервер надо штатно перезапустить после регистрации MODES, поскольку Node import cache сохраняет старый реестр; сохраняется авторизованный процессный контроль, не действия в пользовательских вкладках.

## Схемы и сборщики

- tools/build-schemas.mjs:17–18: mode enum и if/then generation branches. Сейчас базовый builder перечисляет5mode, эволюционный добавляет2; лучше получить список из реестра либо точного общего mode списка, без накопления if/then при повторе.
- tools/build-evolution-schemas.mjs:9–12: общий atlas block, clone relief, затем создать независимый generation-hexlandscape и square-only generation-landscape. engine atlas остаётся с обоими topology.
- tools/build-evolution-schemas.mjs:19: recipe/runtime enum и generation branch.
- tools/build-evolution-schemas.mjs:26: working-session workspaces enum/object. Добавить hexlandscape, не расширять лимитtabs и не делать миграцию живой.run.
- tools/build-export-schemas.mjs:10: project-context.project.mode enum.
- После правок пересобрать root generation/recipe/runtime/session/context/export schemas. Не редактировать вручную только generated JSON.

## Тесты и проверки: точечные изменения

- Новый тест режима: defaults/страница/фиксированная topology, противоположная topology отвергается, caves+reliefhex продолжают работать, два независимых workspace, materialize/content/PNG/runtime roundtrip.
- tests/evolution.test.mjs:27 сейчас генерирует hex через landscape — перевести на hexlandscape; общий low-level generateAtlas(base) в тестах рельефа можно оставить, он mode-independent.
- tests/helpers.mjs:2: уменьшение size/подземныйслой для hexlandscape, чтобы общие тесты не использовали дорогие80×64 defaults.
- tests/project.test.mjs:15, stages.test.mjs:5–6, map-links.test.mjs:15–16, connection-category-actions.test.mjs:41, constraint-fields.test.mjs:15: hardcoded mode arrays расширить, названия «seven» актуализировать.
- tests/web-layout.test.mjs:12: новый HTML в pageNames, HTTP/assets/imports проверяются существующим механизмом.
- tools/verify-content.mjs:8,20: добавить8mode и счётчик, ожидаемо24карты/288операций при неизменном цикле3seed×12ops. Лучше Object.keys(MODES), чтобы следующий режим не выпадал молча.
- tools/verify-portable.mjs:18,46,48: guideCheck.modes!==7, explicit HTTPmode array, httpModes:7. Считать фактический реестр.
- tools/verify-export-context.mjs:14–15 и verify-llm-guide.mjs:18–19 уже обходят MODES, но нужны natural small-size/layer conditions для hexlandscape.
- tools/verify-schema-instances.mjs:14,23 уже обходит MODES; добавить hexlandscape в natural native-schema classifier. Иначе его atlas попадёт на platformer.schema.json. Свежие content hexlandscape schema-data появятся только после расширения verify-content.
- tools/verify-evolution.mjs:13,16,30,33: natural classifier/sizing, mode='landscape'×topology loop разнести по двум режимам, modes:6 устарело уже сейчас.
- tools/verify-large-maps.mjs:27: сценарий256hex теперь hexlandscape, квадратный остаётся landscape.
- tools/qa-landscape-stack.mjs:13,20–21: определениеhex не должно читать удалённый topology select; брать mode/материализованныйlayer, страницы выбирать по topology. Проверять обаstack на1100/360.
- tools/qa-editor-layout.mjs:12–16:8mode и sizedefaults. tools/qa-large-maps.mjs:10 сейчас толькоsquare; новыйhex нужен в отдельном сценарии.
- Web/HTML/ui/qa-map-display.mjs:45 и qa-evolution.mjs:23–33 сейчас проверяют landscapehex через switch — перевести на страницуhexlandscape; не требовать отсутствующий select. Старые QA compatibility/category/map-links/map-actions содержат собственные5/6mode arrays: расширять, если заявляется all-mode QA, не выдавать прежний pass за8режимов.

## Примеры, сохранения и совместимость

Read-only JSON подтвердил examples/landscape.json generation.topology.kind='square', content-demo-project.json recipe/source.request square, examples/caves.json square. Для выделенияhex они не требуют изменения. examples/content-workflow.mjs:5 создаёт landscape через createRecipe и остаётся квадратным. Demo URL workbench.mjs:170 остаётся толькоlandscape: не подменять авторский demo новыйhexрежимом.

Прежние пользовательские landscapehex проекты не преобразовывать в новыйmode и не переписывать. Строгийновыйlandscape может их отклонять с яснойошибкой; новыйhexимпорт также не должен принимать mode='landscape' (workbench.mjs:102 уже требует точныйmode). Это допустимый разрыв без обратнойсовместимости, а не причина редактировать защищённые источники. Перед рестартом и QA не читать/изменять их.

Следующий этап обязательных structure/baseBiome может сделать старые authoredexamples непригодными, если новые поля сделать hard-required для всех старыхrecipe. Это отдельный конфликт требований: нужно заранее определить политику default API-полей/обязательного UI-выбора или получить явное разрешение менять соответствующие bundledexamples. Не прятать миграцию под видом импорта. Stage2fixedtopology сам по себе такого конфликта не создаёт.

Полные тесты, серверы, browser и portable этим аудитом не запускались. Это карта внедрения, не свидетельство исправления или PASS.
