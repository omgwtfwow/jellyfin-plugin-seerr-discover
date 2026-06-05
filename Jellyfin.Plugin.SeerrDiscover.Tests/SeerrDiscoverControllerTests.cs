using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Jellyfin.Plugin.SeerrDiscover.Configuration;
using Jellyfin.Plugin.SeerrDiscover.Controllers;
using Jellyfin.Plugin.SeerrDiscover.Models;
using Jellyfin.Plugin.SeerrDiscover.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Xunit;

namespace Jellyfin.Plugin.SeerrDiscover.Tests;

public sealed class SeerrDiscoverControllerTests
{
    [Theory]
    [InlineData("discover.js")]
    [InlineData("configPage.js")]
    public void BrowserAssets_DoNotContainSecretHeadersOrDynamicScriptExecution(string assetName)
    {
        var source = ReadBrowserAsset(assetName);
        var forbiddenFragments = new[]
        {
            "X-Api-Key",
            "Authorization",
            "Bearer ",
            "AccessToken",
            "accessToken"
        };

        foreach (var fragment in forbiddenFragments)
        {
            Assert.DoesNotContain(fragment, source, StringComparison.OrdinalIgnoreCase);
        }

        Assert.DoesNotMatch(new Regex(@"\bnew\s+Function\b|\beval\s*\(", RegexOptions.IgnoreCase), source);
        Assert.DoesNotMatch(new Regex(@"createElement\s*\(\s*['""]script['""]\s*\)", RegexOptions.IgnoreCase), source);
        Assert.DoesNotMatch(new Regex(@"\.src\s*=\s*['""]https?://", RegexOptions.IgnoreCase), source);
        Assert.DoesNotMatch(new Regex(@"\b(atob|btoa)\s*\(|String\.fromCharCode\s*\(", RegexOptions.IgnoreCase), source);
    }

    [Fact]
    public void DiscoverAsset_RoutesPluginApiCallsThroughSeerrDiscoverProxy()
    {
        var source = ReadBrowserAsset("discover.js");
        var matches = Regex.Matches(source, @"\bapiFetch\(\s*(?<quote>['""`])(?<path>[^'""`]+)");
        var paths = matches
            .Select(match => match.Groups["path"].Value)
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .ToArray();

        Assert.NotEmpty(paths);
        Assert.All(paths, path => Assert.StartsWith("/SeerrDiscover/", path, StringComparison.Ordinal));
        Assert.Contains(paths, path => path.StartsWith("/SeerrDiscover/client-config", StringComparison.Ordinal));
        Assert.Contains(paths, path => path.StartsWith("/SeerrDiscover/config", StringComparison.Ordinal));
        Assert.Contains(paths, path => path.StartsWith("/SeerrDiscover/request", StringComparison.Ordinal));
    }

    [Fact]
    public void BrowserAsset_ApiKeyMentionsAreLimitedToWriteOnlyConfigForm()
    {
        var source = ReadBrowserAsset("discover.js");
        var lines = source
            .Split('\n')
            .Select((line, index) => new { Line = line.Trim(), Number = index + 1 })
            .Where(item => item.Line.Contains("ApiKey", StringComparison.OrdinalIgnoreCase)
                || item.Line.Contains("API key", StringComparison.OrdinalIgnoreCase))
            .ToArray();

        Assert.NotEmpty(lines);
        Assert.All(lines, item => Assert.True(
            IsAllowedConfigApiKeyLine(item.Line),
            $"Unexpected API key reference at line {item.Number}: {item.Line}"));
    }

    [Fact]
    public void DiscoverAsset_PrefersJellyfinApiClientBeforeFetchFallback()
    {
        var source = ReadBrowserAsset("discover.js");
        var apiClientFetch = source.IndexOf("window.ApiClient.fetch", StringComparison.Ordinal);
        var fetchFallback = source.IndexOf("return fetch(apiUrl(path)", StringComparison.Ordinal);

        Assert.True(apiClientFetch >= 0, "discover.js should use Jellyfin ApiClient when it is available.");
        Assert.True(fetchFallback > apiClientFetch, "fetch should remain a fallback after the ApiClient path.");
    }

    [Fact]
    public void DiscoverAsset_KeepsIdempotentBrowserMountMarkers()
    {
        var source = ReadBrowserAsset("discover.js");

        Assert.Contains("document.getElementById(styleId)", source, StringComparison.Ordinal);
        Assert.Contains("root.__seerrMounted", source, StringComparison.Ordinal);
        Assert.Contains("window.SeerrDiscoverInitializeConfigPage", source, StringComparison.Ordinal);
    }

    [Fact]
    public void DiscoverAsset_UsesJellyfinNativeHeaderClearanceScale()
    {
        var source = ReadBrowserAsset("discover.js");
        var largeRule = Regex.Match(
            source,
            @"@media \(min-width: 100em\)\s*\{\s*\.seerr-discover-tab-content\s*\{(?<body>.*?)\}\s*\}",
            RegexOptions.Singleline);
        var updateSpacing = Regex.Match(source, @"function\s+updateDiscoverSpacing\(\)\s*\{(?<body>.*?)\n  \}", RegexOptions.Singleline);
        var topOffsetRules = Regex.Matches(source, @"--seerr-tab-top-offset:\s*(?<value>[^;]+);")
            .Select(match => match.Groups["value"].Value)
            .ToArray();

        Assert.Contains("calc(7.5em + env(safe-area-inset-top))", topOffsetRules);
        Assert.True(largeRule.Success, "discover.js should mirror Jellyfin's large pageWithAbsoluteTabs breakpoint.");
        Assert.Contains("--seerr-tab-top-offset: calc(6.7em + env(safe-area-inset-top));", largeRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("seerr-jellyfin-spacing-probe", source, StringComparison.Ordinal);
        Assert.Contains("libraryPage pageWithAbsoluteTabs seerr-jellyfin-spacing-probe", source, StringComparison.Ordinal);
        Assert.Contains("window.getComputedStyle(probe).paddingTop", source, StringComparison.Ordinal);
        Assert.Contains("pane.style.setProperty('--seerr-tab-top-offset'", source, StringComparison.Ordinal);
        Assert.Contains("header?.offsetHeight", source, StringComparison.Ordinal);
        Assert.Contains("const discoverTopCushionPx = 8;", source, StringComparison.Ordinal);
        Assert.Contains("desiredTopOffset - paneHostTopOffset(pane) + discoverTopCushionPx", source, StringComparison.Ordinal);
        Assert.Contains("pane?.offsetTop", source, StringComparison.Ordinal);
        Assert.Contains("new window.ResizeObserver(scheduleDiscoverSpacing)", source, StringComparison.Ordinal);
        Assert.Contains("new window.MutationObserver", source, StringComparison.Ordinal);
        Assert.Contains("window.visualViewport?.addEventListener('resize', scheduleDiscoverSpacing)", source, StringComparison.Ordinal);
        Assert.All(topOffsetRules, rule =>
        {
            Assert.DoesNotContain("rem", rule, StringComparison.Ordinal);
            Assert.DoesNotContain("vh", rule, StringComparison.Ordinal);
        });
        Assert.True(updateSpacing.Success, "discover.js should keep the Discover spacing update function explicit.");
        Assert.DoesNotContain("getBoundingClientRect", updateSpacing.Groups["body"].Value, StringComparison.Ordinal);
        Assert.DoesNotContain("pane.getBoundingClientRect", source, StringComparison.Ordinal);
        Assert.DoesNotContain("tabs.getBoundingClientRect", source, StringComparison.Ordinal);
        Assert.DoesNotContain("tabsBottom - paneTop", source, StringComparison.Ordinal);
        Assert.DoesNotMatch(new Regex(@"addEventListener\(\s*['""]scroll['""]", RegexOptions.IgnoreCase), source);
    }

    [Fact]
    public void LayoutSpacing_DoesNotAddAdminOffsetConfiguration()
    {
        var forbiddenProperties = new[]
        {
            "DesktopTopOffsetAdjustmentPx",
            "MobileTopOffsetAdjustmentPx",
            "TvTopOffsetAdjustmentPx"
        };
        var configProperties = typeof(PluginConfiguration).GetProperties().Select(property => property.Name).ToArray();
        var dtoProperties = typeof(SeerrDiscoverConfigurationDto).GetProperties().Select(property => property.Name).ToArray();
        var updateProperties = typeof(SeerrDiscoverConfigurationUpdate).GetProperties().Select(property => property.Name).ToArray();

        foreach (var property in forbiddenProperties)
        {
            Assert.DoesNotContain(property, configProperties);
            Assert.DoesNotContain(property, dtoProperties);
            Assert.DoesNotContain(property, updateProperties);
        }
    }

    [Fact]
    public void DiscoverAsset_UsesNativeFirstLoadOnly()
    {
        var source = ReadBrowserAsset("discover.js");

        Assert.Contains("state.loading.add(discoverLoadingKey)", source, StringComparison.Ordinal);
        Assert.Contains("showLoadingMsg", source, StringComparison.Ordinal);
        Assert.Contains("hideLoadingMsg", source, StringComparison.Ordinal);
        Assert.Contains("ensureDiscoverNativeLoading(root)", source, StringComparison.Ordinal);
        Assert.DoesNotContain("seerrDiscoverLoading", source, StringComparison.Ordinal);
        Assert.DoesNotContain("seerrDiscoverLoadingMode", source, StringComparison.Ordinal);
        Assert.DoesNotContain("localStorage", source, StringComparison.Ordinal);
        Assert.DoesNotContain("seerr-skeleton", source, StringComparison.Ordinal);
        Assert.DoesNotContain("skeleton", source, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Loading Discover...", source, StringComparison.Ordinal);
    }

    [Fact]
    public void DiscoverAsset_UsesH2RailHeadings()
    {
        var source = ReadBrowserAsset("discover.js");

        Assert.Contains(".seerr-discover__rail-title", source, StringComparison.Ordinal);
        Assert.Contains("<h2 class=\"sectionTitle sectionTitle-cards padded-left seerr-discover__rail-title\">${escapeHtml(rail.title)}</h2>", source, StringComparison.Ordinal);
        Assert.DoesNotContain(".seerr-discover__rail h3", source, StringComparison.Ordinal);
        Assert.DoesNotContain("<h3>${escapeHtml(rail.title)}</h3>", source, StringComparison.Ordinal);
    }

    [Fact]
    public void DiscoverAsset_ExposesJellyfinNativeThemeHooks()
    {
        var source = ReadBrowserAsset("discover.js");

        Assert.Contains("verticalSection emby-scroller-container seerr-discover__rail", source, StringComparison.Ordinal);
        Assert.Contains("sectionTitle sectionTitle-cards padded-left seerr-discover__rail-title", source, StringComparison.Ordinal);
        Assert.Contains("seerr-discover__scroller padded-left padded-right", source, StringComparison.Ordinal);
        Assert.Contains("function card(item, artworkLayout = artworkLayoutVertical)", source, StringComparison.Ordinal);
        Assert.Contains("const layoutClass = isHorizontal ? 'overflowBackdropCard' : 'overflowPortraitCard';", source, StringComparison.Ordinal);
        Assert.Contains("const padderClass = isHorizontal ? 'cardPadder-overflowBackdrop' : 'cardPadder-overflowPortrait';", source, StringComparison.Ordinal);
        Assert.Contains("data-seerr-artwork-layout", source, StringComparison.Ordinal);
        Assert.Contains("results.map((item) => card(item, artworkLayout)).join('')", source, StringComparison.Ordinal);
        Assert.Contains("const statusBadge = status ? `<span class=\"seerr-card__badge", source, StringComparison.Ordinal);
        Assert.DoesNotContain("typeLabel", source, StringComparison.Ordinal);
        Assert.DoesNotContain("${escapeHtml(typeLabel)}", source, StringComparison.Ordinal);
        Assert.Contains("card-hoverable card-withuserdata seerr-card", source, StringComparison.Ordinal);
        Assert.Contains("role=\"button\" tabindex=\"0\"", source, StringComparison.Ordinal);
        Assert.Contains("cardBox cardBox-bottompadded seerr-card__box", source, StringComparison.Ordinal);
        Assert.Contains("cardScalable seerr-card__scalable", source, StringComparison.Ordinal);
        Assert.Contains("cardPadder ${padderClass} seerr-card__padder", source, StringComparison.Ordinal);
        Assert.Contains("cardImageContainer coveredImage cardContent seerr-card__image", source, StringComparison.Ordinal);
        Assert.Contains("cardText cardTextCentered cardText-first seerr-card__meta", source, StringComparison.Ordinal);
        Assert.Contains("event.key !== 'Enter' && event.key !== ' '", source, StringComparison.Ordinal);
        Assert.DoesNotContain("abyss", source, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void DiscoverAsset_UsesFlexRailsForNativeCardWidths()
    {
        var source = ReadBrowserAsset("discover.js");
        var scrollerRule = Regex.Matches(source, @"\.seerr-discover__scroller\s*\{(?<body>.*?)\}", RegexOptions.Singleline)
            .Cast<Match>()
            .Single(match => match.Groups["body"].Value.Contains("display:", StringComparison.Ordinal));
        var cardRule = Regex.Match(source, @"\.seerr-card\s*\{(?<body>.*?)\}", RegexOptions.Singleline);

        Assert.True(cardRule.Success, "Discover cards should keep an explicit card rule.");
        Assert.Contains("display: flex;", scrollerRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("flex-wrap: nowrap;", scrollerRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("gap: 0.78rem;", scrollerRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("overflow-x: auto;", scrollerRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("flex: 0 0 auto;", cardRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains(".seerr-discover__scroller { gap: 0.65rem; }", source, StringComparison.Ordinal);
        Assert.DoesNotContain("grid-auto-columns", source, StringComparison.Ordinal);
        Assert.DoesNotContain("grid-auto-flow: column", source, StringComparison.Ordinal);
    }

    [Fact]
    public void DiscoverAsset_AlignsRailHeadingsWithFirstThumbnail()
    {
        var source = ReadBrowserAsset("discover.js");
        var firstCardRule = Regex.Match(source, @"\.seerr-discover__scroller\s*>\s*\.seerr-card:first-child\s*\{(?<body>.*?)\}", RegexOptions.Singleline);

        Assert.True(firstCardRule.Success, "Discover rail scrollers should reset the first card margin so rail headings align with the first thumbnail.");
        Assert.Contains("margin-left: 0;", firstCardRule.Groups["body"].Value, StringComparison.Ordinal);
    }

    [Fact]
    public void DiscoverAsset_AddsSafeNativeHooksToModal()
    {
        var source = ReadBrowserAsset("discover.js");

        Assert.Contains("modal.className = 'seerr-modal';", source, StringComparison.Ordinal);
        Assert.Contains("dialog seerr-modal__panel", source, StringComparison.Ordinal);
        Assert.Contains("emby-button seerr-modal__close", source, StringComparison.Ordinal);
        Assert.Contains("<h3 class=\"sectionTitle seerr-modal__section-title\">Overview</h3>", source, StringComparison.Ordinal);
        Assert.Contains("<h3 class=\"sectionTitle seerr-modal__section-title\">Details</h3>", source, StringComparison.Ordinal);
        Assert.Contains("<h3 class=\"sectionTitle seerr-modal__section-title\">Tags</h3>", source, StringComparison.Ordinal);
        Assert.Contains("<h3 class=\"sectionTitle seerr-modal__section-title\">${escapeHtml(group.title)}</h3>", source, StringComparison.Ordinal);
        Assert.DoesNotContain("#itemDetailPage", source, StringComparison.Ordinal);
    }

    [Fact]
    public void DiscoverAsset_AddsNativeDetailRelatedRailsWithNativeHooks()
    {
        var source = ReadBrowserAsset("discover.js");

        Assert.Contains("document.querySelector('.libraryPage:not(.hide)')", source, StringComparison.Ordinal);
        Assert.Contains("querySelector('.detailPageContent')", source, StringComparison.Ordinal);
        Assert.Contains("detailContent.querySelector('#similarCollapsible')", source, StringComparison.Ordinal);
        Assert.Contains("document.addEventListener('viewshow', scheduleMount);", source, StringComparison.Ordinal);
        Assert.Contains("typeof AbortController !== 'undefined' ? new AbortController() : null", source, StringComparison.Ordinal);
        Assert.Contains("data-seerr-native-detail-related", source, StringComparison.Ordinal);
        Assert.Contains("native-detail-${rail.id}", source, StringComparison.Ordinal);
        Assert.Contains("verticalSection emby-scroller-container seerr-discover__rail", source, StringComparison.Ordinal);
        Assert.Contains("sectionTitle sectionTitle-cards padded-left seerr-discover__rail-title", source, StringComparison.Ordinal);
        Assert.Contains(".seerr-native-detail-related .seerr-discover__rail-title,", source, StringComparison.Ordinal);
        Assert.Contains(".seerr-native-detail-related .seerr-discover__scroller", source, StringComparison.Ordinal);
        Assert.Contains("padding-left: 0 !important;", source, StringComparison.Ordinal);
        Assert.Contains("padding-right: 0 !important;", source, StringComparison.Ordinal);
        Assert.Contains("artworkLayout: normalizeArtworkLayout(rail.artworkLayout)", source, StringComparison.Ordinal);
        Assert.Contains("const layoutClass = isHorizontal ? 'overflowBackdropCard' : 'overflowPortraitCard';", source, StringComparison.Ordinal);
        Assert.Contains("card ${layoutClass} card-hoverable card-withuserdata seerr-card", source, StringComparison.Ordinal);
        Assert.Contains("cardBox cardBox-bottompadded", source, StringComparison.Ordinal);
        Assert.Contains("cardScalable", source, StringComparison.Ordinal);
        Assert.Contains("cardImageContainer coveredImage cardContent", source, StringComparison.Ordinal);
        Assert.Contains("cardText cardTextCentered cardText-first", source, StringComparison.Ordinal);
        Assert.Contains("cardText cardTextCentered cardText-secondary", source, StringComparison.Ordinal);
        Assert.DoesNotContain("#itemDetailPage", source, StringComparison.Ordinal);
    }

    [Fact]
    public void DiscoverAsset_DoesNotExposeCollectionsRelatedRail()
    {
        var source = ReadBrowserAsset("discover.js");
        var configPage = ReadConfigurationPage();

        Assert.DoesNotContain("EnableDetailCollections", source, StringComparison.Ordinal);
        Assert.DoesNotContain("EnableDetailCollections", configPage, StringComparison.Ordinal);
        Assert.DoesNotContain("Show movie collection entries", configPage, StringComparison.Ordinal);
        Assert.DoesNotContain("detailRails.collections", source, StringComparison.Ordinal);
    }

    [Fact]
    public void DiscoverAsset_AddsRailPresentationControlsToConfigPage()
    {
        var source = ReadBrowserAsset("discover.js");
        var configPage = ReadConfigurationPage();

        Assert.Contains("DiscoverRailPresentation", source, StringComparison.Ordinal);
        Assert.Contains("DetailRailPresentation", source, StringComparison.Ordinal);
        Assert.Contains("data-config-rail-title", source, StringComparison.Ordinal);
        Assert.Contains("normalizeConfigRailTitle", source, StringComparison.Ordinal);
        Assert.Contains("data-config-rail-move", source, StringComparison.Ordinal);
        Assert.Contains("type=\"checkbox\" is=\"emby-checkbox\" data-config-rail-layout", source, StringComparison.Ordinal);
        Assert.Contains("input.checked ? artworkLayoutHorizontal : artworkLayoutVertical", source, StringComparison.Ordinal);
        Assert.Contains("Horizontal backdrop", source, StringComparison.Ordinal);
        Assert.Contains("id=\"DiscoverRailList\"", configPage, StringComparison.Ordinal);
        Assert.Contains("id=\"DetailRailList\"", configPage, StringComparison.Ordinal);
        Assert.Contains("seerr-config-rail-heading", configPage, StringComparison.Ordinal);
        Assert.Contains("grid-template-areas", configPage, StringComparison.Ordinal);
        Assert.Contains("data-seerr-config-loader", configPage, StringComparison.Ordinal);
        Assert.DoesNotContain("id=\"ExtraRailList\"", configPage, StringComparison.Ordinal);
    }

    [Fact]
    public void ServerConfiguration_DoesNotExposeCollectionsRelatedRail()
    {
        Assert.Null(typeof(PluginConfiguration).GetProperty("EnableDetailCollections"));
        Assert.Null(typeof(SeerrDiscoverConfigurationDto).GetProperty("EnableDetailCollections"));
        Assert.Null(typeof(SeerrDiscoverConfigurationUpdate).GetProperty("EnableDetailCollections"));
        Assert.DoesNotContain(typeof(ISeerrClient).GetMethods(), method => method.Name.Contains("Collection", StringComparison.Ordinal));
    }

    [Fact]
    public void DiscoverAsset_PlacesModalMetadataBeforeRelatedRails()
    {
        var source = ReadBrowserAsset("discover.js");
        var asideIndex = source.IndexOf("<aside class=\"seerr-modal__aside\">", StringComparison.Ordinal);
        var relatedIndex = source.IndexOf("<div class=\"seerr-modal__related\" data-seerr-related></div>", StringComparison.Ordinal);

        Assert.True(asideIndex > 0, "Discover modal should keep a metadata aside.");
        Assert.True(relatedIndex > asideIndex, "Discover modal related rails should render after metadata for mobile stacking.");
        Assert.Contains("</aside>\n          <div class=\"seerr-modal__related\" data-seerr-related></div>", source, StringComparison.Ordinal);
        Assert.Contains("grid-column: 1 / -1;", source, StringComparison.Ordinal);
        Assert.Contains(".seerr-modal__main,\n        .seerr-modal__aside,\n        .seerr-modal__related {\n          grid-column: 1;\n          grid-row: auto;", source, StringComparison.Ordinal);
    }

    [Fact]
    public void DiscoverAsset_KeepsCompactModalPanelsPairedWhenTheyFit()
    {
        var source = ReadBrowserAsset("discover.js");

        Assert.Contains("@media (min-width: 580px) and (max-width: 720px)", source, StringComparison.Ordinal);
        Assert.Contains("grid-template-columns: minmax(0, 1fr) minmax(12rem, 0.72fr);", source, StringComparison.Ordinal);
        Assert.Contains(".seerr-modal__people { grid-template-columns: repeat(2, minmax(0, 1fr)); }", source, StringComparison.Ordinal);
        Assert.Contains("grid-template-columns: repeat(2, minmax(0, 1fr));", source, StringComparison.Ordinal);
        Assert.Contains("@media (max-width: 520px)", source, StringComparison.Ordinal);
        Assert.DoesNotContain(".seerr-modal__people,\n        .seerr-modal__aside {\n          grid-template-columns: 1fr;", source, StringComparison.Ordinal);
        Assert.Contains(".seerr-modal__people {\n          gap: 0.85rem 0.72rem;", source, StringComparison.Ordinal);
        Assert.Contains(".seerr-modal__aside {\n          grid-template-columns: 1fr;", source, StringComparison.Ordinal);
    }

    [Fact]
    public void DiscoverAsset_EllipsizesCompactModalPeopleRows()
    {
        var source = ReadBrowserAsset("discover.js");
        var personTextRule = Regex.Match(source, @"\.seerr-modal__person-text\s*\{(?<body>.*?)\}", RegexOptions.Singleline);
        var personNameRule = Regex.Match(source, @"\.seerr-modal__person strong\s*\{(?<body>.*?)\}", RegexOptions.Singleline);

        Assert.True(personTextRule.Success, "Discover modal people rows should give the text cell a shrinkable wrapper.");
        Assert.True(personNameRule.Success, "Discover modal people names should keep scoped text overflow rules.");
        Assert.Contains("min-width: 0;", personTextRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("overflow: hidden;", personNameRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("text-overflow: ellipsis;", personNameRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("white-space: nowrap;", personNameRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("class=\"seerr-modal__person-text\"", source, StringComparison.Ordinal);
    }

    [Fact]
    public void DiscoverAsset_UsesTwoColumnCompactModalFacts()
    {
        var source = ReadBrowserAsset("discover.js");
        var factRule = Regex.Match(source, @"\.seerr-modal__fact\s*\{(?<body>.*?)\}", RegexOptions.Singleline);
        var factValueRule = Regex.Match(source, @"\.seerr-modal__fact-value\s*\{(?<body>.*?)\}", RegexOptions.Singleline);

        Assert.True(factRule.Success, "Discover modal facts should use scoped containment.");
        Assert.True(factValueRule.Success, "Discover modal fact values should keep scoped wrapping rules.");
        Assert.Contains("min-width: 0;", factRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("overflow-wrap: anywhere;", factValueRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains(".seerr-modal__facts {\n          grid-template-columns: repeat(2, minmax(0, 1fr));\n          gap: 0.72rem 0.95rem;", source, StringComparison.Ordinal);
        Assert.Contains("class=\"seerr-modal__fact\"", source, StringComparison.Ordinal);
    }

    [Fact]
    public void DiscoverAsset_ConstrainsModalOverviewAndRelatedCards()
    {
        var source = ReadBrowserAsset("discover.js");
        var panelRule = Regex.Match(source, @"\.seerr-modal__panel\s*\{(?<body>.*?)\}", RegexOptions.Singleline);
        var detailsRule = Regex.Match(source, @"\.seerr-modal__details\s*\{(?<body>.*?)\}", RegexOptions.Singleline);
        var overviewRule = Regex.Match(source, @"\.seerr-modal__overview\s*\{(?<body>.*?)\}", RegexOptions.Singleline);
        var relatedRule = Regex.Match(source, @"\.seerr-modal__related\s*\{(?<body>.*?)\}", RegexOptions.Singleline);
        var relatedScrollerRule = Regex.Match(source, @"\.seerr-modal__related \.seerr-discover__scroller\s*\{(?<body>.*?)\}", RegexOptions.Singleline);
        var relatedCardRule = Regex.Match(source, @"\.seerr-modal__related \.seerr-card\s*\{(?<body>.*?)\}", RegexOptions.Singleline);

        Assert.True(panelRule.Success, "Discover modal panel should keep scoped overflow rules.");
        Assert.True(detailsRule.Success, "Discover modal details should keep scoped containment rules.");
        Assert.True(overviewRule.Success, "Discover modal overview should keep scoped wrapping rules.");
        Assert.True(relatedRule.Success, "Discover modal related area should keep scoped containment rules.");
        Assert.True(relatedScrollerRule.Success, "Discover modal related scroller should keep scoped overflow rules.");
        Assert.True(relatedCardRule.Success, "Discover modal related cards should keep scoped compact sizing.");
        Assert.Contains("max-width: calc(100vw - 1rem);", panelRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("overflow-x: hidden;", panelRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("overflow-y: auto;", panelRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("min-width: 0;", detailsRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("overflow: hidden;", detailsRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("min-width: 0;", overviewRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("max-width: 100%;", overviewRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("overflow-wrap: anywhere;", overviewRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("white-space: normal;", overviewRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("min-width: 0;", relatedRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("overflow: hidden;", relatedRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("max-width: 100%;", relatedScrollerRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("overflow-x: auto;", relatedScrollerRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains("width: clamp(6.7rem, 10vw, 8.6rem);", relatedCardRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.Contains(".seerr-modal__related .cardText", source, StringComparison.Ordinal);
        Assert.Contains(".seerr-modal__related .seerr-card__badge", source, StringComparison.Ordinal);
    }

    [Fact]
    public void DiscoverAsset_UsesNativeCardTextRowsForTitleAndYear()
    {
        var source = ReadBrowserAsset("discover.js");
        var metaRule = Regex.Match(source, @"\.seerr-card \.seerr-card__meta\s*\{(?<body>.*?)\}", RegexOptions.Singleline);

        Assert.True(metaRule.Success, "Discover cards should keep a scoped metadata rule after adopting native cardText classes.");
        Assert.Contains("cardText cardTextCentered cardText-first seerr-card__meta seerr-card__title", source, StringComparison.Ordinal);
        Assert.Contains("cardText cardTextCentered cardText-secondary seerr-card__meta seerr-card__year", source, StringComparison.Ordinal);
        Assert.DoesNotContain("white-space: normal;", metaRule.Groups["body"].Value, StringComparison.Ordinal);
        Assert.DoesNotMatch(@"\.seerr-card \.seerr-card__title\s*\{", source);
        Assert.DoesNotContain("${escapeHtml(title)}${year ? ` <span", source, StringComparison.Ordinal);
    }

    [Fact]
    public void DiscoverAsset_RawButtonsInheritJellyfinTypography()
    {
        var source = ReadBrowserAsset("discover.js");
        var cardRule = CssRuleBodies(@"\.seerr-card")
            .Single(body => body.Contains("font: inherit;", StringComparison.Ordinal));

        AssertRuleContains(@"\.seerr-discover__button", "font: inherit;");
        Assert.Contains("font: inherit;", cardRule, StringComparison.Ordinal);
        Assert.DoesNotContain("font-family", cardRule, StringComparison.OrdinalIgnoreCase);
        AssertRuleContains(@"\.seerr-modal__close", "font-family: inherit;");
        AssertRuleContains(@"\.seerr-modal__trailer-link", "font: inherit;");
        AssertRuleContains(@"\.seerr-toast__close", "font: inherit;");

        string[] CssRuleBodies(string selectorPattern)
        {
            return Regex.Matches(source, $@"{selectorPattern}\s*\{{(?<body>.*?)\}}", RegexOptions.Singleline)
                .Select(match => match.Groups["body"].Value)
                .ToArray();
        }

        void AssertRuleContains(string selectorPattern, string expected)
        {
            var bodies = CssRuleBodies(selectorPattern);
            Assert.NotEmpty(bodies);
            Assert.Contains(bodies, body => body.Contains(expected, StringComparison.Ordinal));
        }
    }

    [Fact]
    public void Controller_DefaultsToJellyfinAuthenticatedEndpoints()
    {
        Assert.Contains(
            typeof(SeerrDiscoverController).GetCustomAttributes<AuthorizeAttribute>(inherit: true),
            attribute => string.IsNullOrWhiteSpace(attribute.Roles));
    }

    [Fact]
    public void StaticBrowserAssets_AreTheOnlyAnonymousActions()
    {
        var anonymousActions = ControllerActionMethods()
            .Where(method => method.GetCustomAttributes<AllowAnonymousAttribute>(inherit: true).Any())
            .Select(method => method.Name)
            .Order(StringComparer.Ordinal)
            .ToArray();

        Assert.Equal([nameof(SeerrDiscoverController.GetConfigPageAsset), nameof(SeerrDiscoverController.GetDiscoverAsset)], anonymousActions);
    }

    [Theory]
    [InlineData(nameof(SeerrDiscoverController.GetDiscoverAsset), "assets/discover.js")]
    [InlineData(nameof(SeerrDiscoverController.GetConfigPageAsset), "assets/configPage.js")]
    public void StaticBrowserAssets_AreAnonymousJavaScriptAssets(string methodName, string routeTemplate)
    {
        var method = ControllerAction(methodName);
        var route = Assert.Single(method.GetCustomAttributes<HttpGetAttribute>(inherit: true));
        var produces = Assert.Single(method.GetCustomAttributes<ProducesAttribute>(inherit: true));

        Assert.True(method.GetCustomAttributes<AllowAnonymousAttribute>(inherit: true).Any());
        Assert.Equal(routeTemplate, route.Template);
        Assert.Contains("text/javascript", produces.ContentTypes);
    }

    [Theory]
    [InlineData(nameof(SeerrDiscoverController.GetConfiguration))]
    [InlineData(nameof(SeerrDiscoverController.UpdateConfiguration))]
    [InlineData(nameof(SeerrDiscoverController.GetRailOptions))]
    public void AdminEndpoints_RequireAdministratorRole(string methodName)
    {
        var method = ControllerAction(methodName);
        var authorize = method.GetCustomAttributes<AuthorizeAttribute>(inherit: true);

        Assert.DoesNotContain(method.GetCustomAttributes<AllowAnonymousAttribute>(inherit: true), _ => true);
        Assert.Contains(authorize, attribute => attribute.Roles == "Administrator");
    }

    [Fact]
    public void ConfigurationDto_RedactsStoredApiKey()
    {
        var dto = ToConfigurationDto(new PluginConfiguration
        {
            SeerrApiKey = "stored-secret-value",
            SeerrBaseUrl = "http://seerr:5055",
            SeerrPublicUrl = "https://seerr.example"
        });

        var json = JsonSerializer.Serialize(dto);

        Assert.True(dto.SeerrApiKeyConfigured);
        Assert.DoesNotContain(typeof(SeerrDiscoverConfigurationDto).GetProperties(), property => property.Name == "SeerrApiKey");
        Assert.DoesNotContain("stored-secret-value", json, StringComparison.Ordinal);
        Assert.Contains("SeerrApiKeyConfigured", json, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("{\"message\":\"Request for this media already exists.\"}", "Request for this media already exists.")]
    [InlineData("{\"error\":\"quota_exceeded\"}", "quota_exceeded")]
    [InlineData("{\"message\":[\"first\",\"second\"]}", "first; second")]
    public void ExtractSeerrMessage_ReadsUsefulFailureText(string responseBody, string expected)
    {
        var method = typeof(SeerrDiscoverController).GetMethod("ExtractSeerrMessage", BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        Assert.Equal(expected, method!.Invoke(null, [responseBody]));
    }

    [Theory]
    [InlineData("plain failure")]
    [InlineData("{\"message\":{\"detail\":\"do not leak structured payloads\"}}")]
    public void ExtractSeerrMessage_RedactsUnsafeFailureText(string responseBody)
    {
        var method = typeof(SeerrDiscoverController).GetMethod("ExtractSeerrMessage", BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        Assert.Null(method!.Invoke(null, [responseBody]));
    }

    [Fact]
    public void ApplyConfigurationUpdate_PreservesStoredApiKeyWhenBlank()
    {
        var config = new PluginConfiguration
        {
            SeerrApiKey = "stored-secret",
            SeerrBaseUrl = "http://old:5055",
            SeerrPublicUrl = "https://old.example",
            Language = "en"
        };
        var update = new SeerrDiscoverConfigurationUpdate
        {
            SeerrBaseUrl = " http://seerr:5055 ",
            SeerrPublicUrl = " https://seerr.example/ ",
            SeerrApiKey = "",
            Language = " es ",
            DiscoverCacheSeconds = 600,
            DetailsCacheSeconds = 300,
            SearchCacheSeconds = 60,
            UserCacheSeconds = 60,
            RequireMappedUser = true,
            EnableNativeSearchIntegration = true,
            EnableTrending = true,
            EnableTrendingMovies = true,
            EnableTrendingTv = true,
            EnableMovies = true,
            EnableTv = true,
            EnableUpcoming = true
        };

        ApplyConfigurationUpdate(config, update);

        Assert.Equal("stored-secret", config.SeerrApiKey);
        Assert.Equal("http://seerr:5055", config.SeerrBaseUrl);
        Assert.Equal("https://seerr.example", config.SeerrPublicUrl);
        Assert.Equal("es", config.Language);
        Assert.True(config.EnableNativeSearchIntegration);
    }

    [Fact]
    public void LegacyDisabledTrending_DisablesSplitTrendingUntilSettingsAreSaved()
    {
        var config = new PluginConfiguration
        {
            EnableTrending = false,
            EnableTrendingMovies = true,
            EnableTrendingTv = true,
            UseSplitTrendingRailSettings = false
        };

        Assert.False(IsFeedEnabled(config, "trending-movies"));
        Assert.False(IsFeedEnabled(config, "trending-tv"));
    }

    [Fact]
    public void ApplyConfigurationUpdate_SplitTrendingSettingsDoNotDependOnLegacyTrending()
    {
        var config = new PluginConfiguration
        {
            EnableTrending = false,
            EnableTrendingMovies = true,
            EnableTrendingTv = true,
            UseSplitTrendingRailSettings = false
        };
        var update = new SeerrDiscoverConfigurationUpdate
        {
            SeerrBaseUrl = "http://seerr:5055",
            Language = "en",
            EnableTrending = false,
            EnableTrendingMovies = true,
            EnableTrendingTv = false,
            EnableMovies = true,
            EnableTv = true,
            EnableUpcoming = true
        };

        ApplyConfigurationUpdate(config, update);

        Assert.True(config.UseSplitTrendingRailSettings);
        Assert.True(config.EnableTrending);
        Assert.True(IsFeedEnabled(config, "trending-movies"));
        Assert.False(IsFeedEnabled(config, "trending-tv"));
    }

    [Fact]
    public void ApplyConfigurationUpdate_LegacyTrendingUpdateStillControlsSplitTrendingWhenNewFieldsAreMissing()
    {
        var config = new PluginConfiguration();
        var update = new SeerrDiscoverConfigurationUpdate
        {
            SeerrBaseUrl = "http://seerr:5055",
            Language = "en",
            EnableTrending = false,
            EnableMovies = true,
            EnableTv = true,
            EnableUpcoming = true
        };

        ApplyConfigurationUpdate(config, update);

        Assert.False(config.EnableTrending);
        Assert.False(config.EnableTrendingMovies);
        Assert.False(config.EnableTrendingTv);
        Assert.False(IsFeedEnabled(config, "trending-movies"));
        Assert.False(IsFeedEnabled(config, "trending-tv"));
    }

    [Fact]
    public void ApplyConfigurationUpdate_CanDisableNativeSearchIntegration()
    {
        var config = new PluginConfiguration
        {
            EnableNativeSearchIntegration = true
        };
        var update = new SeerrDiscoverConfigurationUpdate
        {
            SeerrBaseUrl = "http://seerr:5055",
            Language = "en",
            DiscoverCacheSeconds = 600,
            DetailsCacheSeconds = 300,
            SearchCacheSeconds = 60,
            UserCacheSeconds = 60,
            EnableNativeSearchIntegration = false
        };

        ApplyConfigurationUpdate(config, update);

        Assert.False(config.EnableNativeSearchIntegration);
    }

    [Fact]
    public void ApplyConfigurationUpdate_SavesExpandedRailSettings()
    {
        var config = new PluginConfiguration();
        var update = new SeerrDiscoverConfigurationUpdate
        {
            SeerrBaseUrl = "http://seerr:5055",
            Language = "en",
            EnableTrending = true,
            EnableTrendingMovies = true,
            EnableTrendingTv = true,
            EnableMovies = true,
            EnableTv = true,
            EnableUpcoming = true,
            EnableUpcomingTv = false,
            EnableRecentlyRequested = true,
            EnablePopularWithServer = true,
            EnableDetailSimilar = true,
            EnableDetailRecommended = true,
            ExtraRails =
            [
                new SeerrExtraRailDto
                {
                    Kind = "Genre",
                    MediaType = "Movie",
                    Value = "27",
                    Title = "Horror Movies",
                    Enabled = true
                },
                new SeerrExtraRailDto
                {
                    Kind = "Network",
                    MediaType = "tv",
                    Value = "49",
                    Title = "HBO TV",
                    Enabled = false
                }
            ]
        };

        ApplyConfigurationUpdate(config, update);

        Assert.False(config.EnableUpcomingTv);
        Assert.True(config.EnableRecentlyRequested);
        Assert.True(config.EnablePopularWithServer);
        Assert.True(config.EnableDetailSimilar);
        Assert.True(config.EnableDetailRecommended);
        Assert.True(IsFeedEnabled(config, "recently-requested"));
        Assert.True(IsFeedEnabled(config, "server-popular"));
        Assert.True(IsFeedEnabled(config, "genre-movie-27"));
        Assert.False(IsFeedEnabled(config, "network-tv-49"));
    }

    [Fact]
    public void ToConfigurationDto_DefaultsRailPresentationToCurrentOrderAndVerticalLayout()
    {
        var dto = ToConfigurationDto(new PluginConfiguration());

        Assert.Equal(
            ["trending-movies", "trending-tv", "movies", "tv", "upcoming", "upcoming-tv", "recently-requested", "server-popular"],
            dto.DiscoverRailPresentation.Select(rail => rail.Id).ToArray());
        Assert.All(dto.DiscoverRailPresentation, rail => Assert.Equal("vertical", rail.ArtworkLayout));
        Assert.All(dto.DiscoverRailPresentation, rail => Assert.Equal(string.Empty, rail.Title));
        Assert.Equal(["similar", "recommended"], dto.DetailRailPresentation.Select(rail => rail.Id).ToArray());
        Assert.All(dto.DetailRailPresentation, rail => Assert.Equal("vertical", rail.ArtworkLayout));
        Assert.All(dto.DetailRailPresentation, rail => Assert.Equal(string.Empty, rail.Title));
    }

    [Fact]
    public void ApplyConfigurationUpdate_NormalizesRailPresentationOrderAndLayout()
    {
        var config = new PluginConfiguration();
        var update = new SeerrDiscoverConfigurationUpdate
        {
            SeerrBaseUrl = "http://seerr:5055",
            Language = "en",
            EnableTrending = true,
            EnableTrendingMovies = true,
            EnableTrendingTv = true,
            EnableMovies = true,
            EnableTv = true,
            EnableUpcoming = true,
            EnableUpcomingTv = true,
            EnableRecentlyRequested = true,
            EnablePopularWithServer = true,
            EnableDetailSimilar = true,
            EnableDetailRecommended = true,
            ExtraRails =
            [
                new SeerrExtraRailDto
                {
                    Kind = "genre",
                    MediaType = "movie",
                    Value = "27",
                    Title = "Horror Movies",
                    Enabled = true
                }
            ],
            DiscoverRailPresentation =
            [
                new SeerrRailPresentationDto { Id = "server-popular", ArtworkLayout = "horizontal", Title = "Server Favorites" },
                new SeerrRailPresentationDto { Id = "invalid", ArtworkLayout = "horizontal", Title = "Ignored" },
                new SeerrRailPresentationDto { Id = "movies", ArtworkLayout = "sideways", Title = "  Popular Picks  " },
                new SeerrRailPresentationDto { Id = "server-popular", ArtworkLayout = "vertical" },
                new SeerrRailPresentationDto { Id = "genre-movie-27", ArtworkLayout = "horizontal", Title = new string('x', 120) }
            ],
            DetailRailPresentation =
            [
                new SeerrRailPresentationDto { Id = "recommended", ArtworkLayout = "horizontal", Title = "For You" },
                new SeerrRailPresentationDto { Id = "collections", ArtworkLayout = "horizontal" },
                new SeerrRailPresentationDto { Id = "similar", ArtworkLayout = "wide", Title = "More Like This" },
                new SeerrRailPresentationDto { Id = "recommended", ArtworkLayout = "vertical" }
            ]
        };

        ApplyConfigurationUpdate(config, update);

        Assert.Equal(
            ["server-popular", "movies", "genre-movie-27", "trending-movies", "trending-tv", "tv", "upcoming", "upcoming-tv", "recently-requested"],
            config.DiscoverRailPresentation.Select(rail => rail.Id).ToArray());
        Assert.Equal("horizontal", config.DiscoverRailPresentation[0].ArtworkLayout);
        Assert.Equal("vertical", config.DiscoverRailPresentation[1].ArtworkLayout);
        Assert.Equal("horizontal", config.DiscoverRailPresentation[2].ArtworkLayout);
        Assert.Equal("Server Favorites", config.DiscoverRailPresentation[0].Title);
        Assert.Equal("Popular Picks", config.DiscoverRailPresentation[1].Title);
        Assert.Equal(96, config.DiscoverRailPresentation[2].Title.Length);
        Assert.Equal(["recommended", "similar"], config.DetailRailPresentation.Select(rail => rail.Id).ToArray());
        Assert.Equal("horizontal", config.DetailRailPresentation[0].ArtworkLayout);
        Assert.Equal("vertical", config.DetailRailPresentation[1].ArtworkLayout);
        Assert.Equal("For You", config.DetailRailPresentation[0].Title);
        Assert.Equal("More Like This", config.DetailRailPresentation[1].Title);
    }

    [Fact]
    public void BuildDiscoverRails_UsesConfiguredOrderAndSkipsDisabledRails()
    {
        var config = new PluginConfiguration
        {
            UseSplitTrendingRailSettings = true,
            EnableTrendingMovies = false,
            EnableTrendingTv = true,
            EnableMovies = true,
            EnableTv = false,
            EnableUpcoming = true,
            EnableUpcomingTv = false,
            EnableRecentlyRequested = true,
            EnablePopularWithServer = false,
            DiscoverRailPresentation =
            [
                new SeerrRailPresentation { Id = "server-popular", ArtworkLayout = "horizontal" },
                new SeerrRailPresentation { Id = "recently-requested", ArtworkLayout = "horizontal", Title = "Fresh Requests" },
                new SeerrRailPresentation { Id = "movies", ArtworkLayout = "vertical", Title = "Movie Picks" },
                new SeerrRailPresentation { Id = "trending-tv", ArtworkLayout = "horizontal", Title = "TV Heat" }
            ]
        };

        var rails = BuildDiscoverRails(config);

        Assert.Equal(["recently-requested", "movies", "trending-tv", "upcoming"], rails.Select(rail => rail.Id).ToArray());
        Assert.Equal(["horizontal", "vertical", "horizontal", "vertical"], rails.Select(rail => rail.ArtworkLayout).ToArray());
        Assert.Equal(["Fresh Requests", "Movie Picks", "TV Heat", "Upcoming Movies"], rails.Select(rail => rail.Title).ToArray());
    }

    [Fact]
    public void BuildDetailRails_UsesConfiguredOrderAndLayout()
    {
        var config = new PluginConfiguration
        {
            DetailRailPresentation =
            [
                new SeerrRailPresentation { Id = "recommended", ArtworkLayout = "horizontal", Title = "Chosen For You" },
                new SeerrRailPresentation { Id = "similar", ArtworkLayout = "vertical", Title = "More Like This" }
            ]
        };

        var rails = BuildDetailRails(config);

        Assert.Equal(["recommended", "similar"], rails.Select(rail => rail.Id).ToArray());
        Assert.Equal(["horizontal", "vertical"], rails.Select(rail => rail.ArtworkLayout).ToArray());
        Assert.Equal(["Chosen For You", "More Like This"], rails.Select(rail => rail.Title).ToArray());
    }

    [Fact]
    public void IsFeedEnabled_RejectsUnconfiguredExpandedRails()
    {
        var config = new PluginConfiguration
        {
            EnableRecentlyRequested = false,
            EnablePopularWithServer = false,
            ExtraRails =
            [
                new SeerrExtraRail
                {
                    Kind = "genre",
                    MediaType = "movie",
                    Value = "27",
                    Title = "Horror Movies",
                    Enabled = false
                }
            ]
        };

        Assert.False(IsFeedEnabled(config, "recently-requested"));
        Assert.False(IsFeedEnabled(config, "server-popular"));
        Assert.False(IsFeedEnabled(config, "genre-movie-27"));
        Assert.False(IsFeedEnabled(config, "genre-tv-27"));
    }

    [Fact]
    public void RemoveRequestUserData_StripsRequesterFields()
    {
        var node = JsonNode.Parse("""
        {
          "mediaInfo": {
            "requests": [
              {
                "id": 1,
                "requestedBy": { "email": "user@example.com" },
                "modifiedBy": { "username": "admin" }
              }
            ]
          }
        }
        """);

        var method = typeof(SeerrDiscoverController).GetMethod("RemoveRequestUserData", BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        method!.Invoke(null, [node]);
        var json = node!.ToJsonString();
        Assert.DoesNotContain("requestedBy", json);
        Assert.DoesNotContain("modifiedBy", json);
        Assert.Contains("\"id\":1", json);
    }

    [Fact]
    public void ApplyConfigurationUpdate_ClearsStoredApiKeyOnlyWhenRequested()
    {
        var config = new PluginConfiguration { SeerrApiKey = "stored-secret" };
        var update = new SeerrDiscoverConfigurationUpdate
        {
            SeerrBaseUrl = "http://seerr:5055",
            Language = "en",
            ClearSeerrApiKey = true
        };

        ApplyConfigurationUpdate(config, update);

        Assert.Empty(config.SeerrApiKey);
    }

    private static void ApplyConfigurationUpdate(PluginConfiguration config, SeerrDiscoverConfigurationUpdate update)
    {
        var method = typeof(SeerrDiscoverController).GetMethod("ApplyConfigurationUpdate", BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        method!.Invoke(null, [config, update]);
    }

    private static SeerrDiscoverConfigurationDto ToConfigurationDto(PluginConfiguration config)
    {
        var method = typeof(SeerrDiscoverController).GetMethod("ToConfigurationDto", BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        return Assert.IsType<SeerrDiscoverConfigurationDto>(method!.Invoke(null, [config]));
    }

    private static bool IsFeedEnabled(PluginConfiguration config, string feed, string? mediaType = null)
    {
        var method = typeof(SeerrDiscoverController).GetMethod("IsFeedEnabled", BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        return Assert.IsType<bool>(method!.Invoke(null, [config, feed, mediaType]));
    }

    private static IReadOnlyList<(string Id, string Title, string ArtworkLayout)> BuildDiscoverRails(PluginConfiguration config)
    {
        var method = typeof(SeerrDiscoverController)
            .GetMethods(BindingFlags.NonPublic | BindingFlags.Static)
            .Single(method => method.Name == "BuildDiscoverRails" && method.GetParameters().Length == 1);

        return ReflectRailPresentation(method.Invoke(null, [config]));
    }

    private static IReadOnlyList<(string Id, string Title, string ArtworkLayout)> BuildDetailRails(PluginConfiguration config)
    {
        var method = typeof(SeerrDiscoverController).GetMethod("BuildDetailRails", BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        return ReflectRailPresentation(method!.Invoke(null, [config]));
    }

    private static IReadOnlyList<(string Id, string Title, string ArtworkLayout)> ReflectRailPresentation(object? rails)
    {
        Assert.NotNull(rails);
        return ((System.Collections.IEnumerable)rails!)
            .Cast<object>()
            .Select(rail =>
            {
                var type = rail.GetType();
                return (
                    Id: Assert.IsType<string>(type.GetProperty("Id")?.GetValue(rail)),
                    Title: Assert.IsType<string>(type.GetProperty("Title")?.GetValue(rail)),
                    ArtworkLayout: Assert.IsType<string>(type.GetProperty("ArtworkLayout")?.GetValue(rail)));
            })
            .ToList();
    }

    private static MethodInfo ControllerAction(string methodName)
    {
        var method = typeof(SeerrDiscoverController).GetMethod(methodName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly);

        Assert.NotNull(method);
        return method!;
    }

    private static IEnumerable<MethodInfo> ControllerActionMethods()
        => typeof(SeerrDiscoverController)
            .GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly)
            .Where(method => method.GetCustomAttributes<HttpMethodAttribute>(inherit: true).Any());

    private static bool IsAllowedConfigApiKeyLine(string line)
        => line.Contains("apiKeyInput", StringComparison.Ordinal)
            || line.Contains("clearApiKeyInput", StringComparison.Ordinal)
            || line.Contains("apiKeyStatus", StringComparison.Ordinal)
            || line.Contains("querySelector('#SeerrApiKey", StringComparison.Ordinal)
            || line.Contains("config.SeerrApiKeyConfigured", StringComparison.Ordinal)
            || line.Contains("assignConfigValue(config, 'SeerrApiKey'", StringComparison.Ordinal)
            || line.Contains("assignConfigValue(config, 'ClearSeerrApiKey'", StringComparison.Ordinal)
            || line.Contains("Paste Seerr API key", StringComparison.Ordinal)
            || line.Contains("A Seerr API key is configured", StringComparison.Ordinal)
            || line.Contains("No Seerr API key is configured", StringComparison.Ordinal);

    private static string ReadBrowserAsset(string fileName)
    {
        var resourceName = $"Jellyfin.Plugin.SeerrDiscover.Web.{fileName}";
        using var stream = typeof(SeerrDiscoverController).Assembly.GetManifestResourceStream(resourceName);

        Assert.NotNull(stream);
        using var reader = new StreamReader(stream!);
        return reader.ReadToEnd();
    }

    private static string ReadConfigurationPage()
    {
        var resourceName = "Jellyfin.Plugin.SeerrDiscover.Configuration.configPage.html";
        using var stream = typeof(SeerrDiscoverController).Assembly.GetManifestResourceStream(resourceName);

        Assert.NotNull(stream);
        using var reader = new StreamReader(stream!);
        return reader.ReadToEnd();
    }
}
