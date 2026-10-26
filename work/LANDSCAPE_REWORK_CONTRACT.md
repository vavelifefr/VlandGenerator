# Размеры и дополнительные биомы — контракт текущего этапа

## Область и решение

Root разрешил изменения defaults/UI, canonical recipe normalization, native atlas bounds и схем. Файлы: app/modes/natural.mjs, app/project.mjs, app/generation-settings.mjs, Web/HTML/ui/controls.mjs, engine/api/atlas-catalog.mjs, tools/build-evolution-schemas.mjs, tools/build-export-schemas.mjs и их generated schemas. Engine/core/landscape-profile.mjs принадлежит отдельному агенту: его реализация нормализатора использована, но этим агентом не изменялась. Новые формы суши/размещение биомов и окончательная визуальная приёмка вне данного подэтапа.

`generation.landscape.additionalBiomes` — необязательный массив profile ID: meadow/forest/swamp/desert/snow/mountains/volcanic. До6 уникальных строк, основной baseBiome запрещён. Отсутствие поля означает пустой список как штатное default-значение, без алиасов/миграций. Новые defaults всегда содержат[]. Канонический порядок соответствует LANDSCAPE_BIOMES; порядок кликов не меняет нормализованный запрос. Native landscape целиком по-прежнему необязателен. Другие app-режимы профиль не принимают.

normalizeRecipe сохраняет возвращённый normalizeLandscapeProfile в клоне рецепта, не изменяя вход. generationSettingsErrors нормализует обе стороны сравнения профиля, поэтому одна перестановка массива не становится ложным изменением основы. Изменение состава требует пересоздания карты. Контекст копирует профиль целиком; его схема описывает тот же optional-массив, uniqueItems/maxItems и запрет base через семь if/then условий. Наличие дополнительных биомов не вводит sources/vegetation или новые категории содержимого.

## Интерфейс

В блоке основы landscape/hexlandscape одна кнопка «Добавить биом» раскрывает скрытый fieldset с галочками и понятной сводкой выбранного. Основной биом скрыт/disabled в этом списке; смена основного удаляет совпавший дополнительный выбор. Галочки изменяют черновик и вызывают общий onChange; текущая карта не заменяется. IDs: add-landscape-biome, landscape-additional-biomes, landscape-additional-summary; data-additional-biome содержит точный profile ID. Скрытие дополнительно использует существующий класс hidden, чтобы author CSS не переопределял HTML hidden.

Остаются существующие width/height, без новой кнопочной панели или публичного scale. Верхний предел сторон всех atlas/природных форм —300; нижний16. UI сообщает зависимость времени от площади/числа срезов. Общий ATLAS_MAX_CELLS=98304 сохранён:50²/100²/200²/300² поддерживаются по размеру,300² допускает только одну поверхность. Многослойный заказ300² отклоняется с ATLAS_TOO_LARGE, без скрытого уменьшения. Caves по-прежнему требует хотя бы один подземный срез, relief — ровно поверхность; их механика не менялась.

Schema bounds согласованы: request/generation side<=300; native arrays<=98304, flowTo/flowRank/basin/routeCells index<=98303, drainage<=98304, coastDistance<=600 (sentinel width+height при отсутствии моря). Atlas tiles получают те же поля и пределы вложенных массивов deposits/sites. Source board/tiles width/height тоже<=300. Content/PNG/API byte limits не увеличены.

## Наблюдаемые проверки

- [TDD](../evidence/landscape-rework-contract-tdd.txt): до реализации все7 новых contract-тестов FAIL. Дополнительная проверка обнаружила оставшийся routeCells index65535; её FAIL записан в тот же лог, затем schema builder исправлен.
- [Целевой прогон](../evidence/landscape-rework-contract-tests.txt):14/14 PASS —7 новых contract +7 прежних app profile. Проверены default[]/независимость, optional/invalid/canonical inputs, immutable recipe, source/context roundtrip, reorder-vs-changed set, размеры50/100/200/300,301отказ и превышение бюджета слоёв. Минимальный DOM double проверяет реальные renderControls listeners/checklist/summary/main exclusion; это не браузерная визуальная проверка.
- [JSON Schema](../evidence/landscape-rework-contract-schema.txt): существующее внешнее QA-окружение jsonschema, offline Registry.59метасхем;108положительных size-request/profile/context-fragment документов и272отрицательных контроля. Отдельно13положительных и13отрицательных native field/index фрагментов, включая массив90000 элементов. Это bounded schema QA, не полные generated300 проекты.
- node --check изменённых JS-модулей PASS. Generated schemas перестроены последовательностью node tools/build-evolution-schemas.mjs, затем node tools/build-export-schemas.mjs; базовый build-schemas не запускался, существующие transport schemas сохранены.

Root завершил общую проверку после окончательного freeze: Node286/286, portable286/286,32 real/112 all-six,18 browser-генераций на1100/360, HTTP/CLI и actual app визуальный контактлист PASS. Полные результаты и ограничения: evidence/landscape-rework-verification.json. Проекты, примеры, fixtures, живая.run, сервер9670 и пользовательские вкладки не использовались; desktop consent отсутствует. Установки/AI-запросы/коммиты не выполнялись.
