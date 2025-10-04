const defaultFishValue = 900;
const treasureValue = 32000;

const state = {
  selectedLocation: null,
  selectedRod: null,
  selectedArmor: null,
  selectedPet: null,
  skillLevel: 25,
  sessionLength: 1,
  includeFestival: false,
  includeDoubleHook: false,
  searchQuery: "",
};

const fishMap = new Map(fishData.map((fish) => [fish.id, { ...fish }]));
const locationMap = new Map(locationData.map((loc) => [loc.id, { ...loc }]));
const gearMap = {
  rods: new Map(gearData.rods.map((rod) => [rod.id, { ...rod }])),
  armor: new Map(gearData.armor.map((armor) => [armor.id, { ...armor }])),
  pets: new Map(gearData.pets.map((pet) => [pet.id, { ...pet }])),
};

const formatCoins = (value) =>
  `Ꙩ ${value.toLocaleString(undefined, {
    maximumFractionDigits: value < 100000 ? 1 : 0,
  })}`;

const populateSelects = () => {
  const locationSelect = document.getElementById("location-select");
  const rodSelect = document.getElementById("rod-select");
  const armorSelect = document.getElementById("armor-select");
  const petSelect = document.getElementById("pet-select");
  const optimizerLocation = document.getElementById("optimizer-location");

  locationData.forEach((loc) => {
    const option = new Option(loc.name, loc.id);
    locationSelect.appendChild(option);
    optimizerLocation.appendChild(option.cloneNode(true));
  });

  gearData.rods.forEach((rod) => {
    rodSelect.appendChild(new Option(rod.name, rod.id));
  });
  gearData.armor.forEach((armor) => {
    armorSelect.appendChild(new Option(armor.name, armor.id));
  });
  gearData.pets.forEach((pet) => {
    petSelect.appendChild(new Option(pet.name, pet.id));
  });

  state.selectedLocation = locationSelect.value = locationData[0]?.id ?? "";
  optimizerLocation.value = state.selectedLocation;
  state.selectedRod = rodSelect.value = gearData.rods[0]?.id ?? "";
  state.selectedArmor = armorSelect.value = gearData.armor[0]?.id ?? "";
  state.selectedPet = petSelect.value = gearData.pets[0]?.id ?? "";
};

const getFishPrice = (fishId) => fishMap.get(fishId)?.basePrice ?? defaultFishValue;
const setFishPrice = (fishId, value) => {
  const fish = fishMap.get(fishId);
  if (fish) {
    fish.basePrice = value;
  }
};

const calculateProfit = (location, gear, options) => {
  const rod = gearMap.rods.get(gear.rod);
  const armor = gearMap.armor.get(gear.armor);
  const pet = gearMap.pets.get(gear.pet);

  if (!rod || !armor || !pet) {
    return {
      profitPerHour: 0,
      fishPerHour: 0,
      breakdown: [],
      treasureValue: 0,
    };
  }

  const skillMultiplier = 1 + options.skillLevel * 0.012;
  const festivalMultiplier = options.includeFestival ? buffs.festival.catchMultiplier : 1;
  const doubleHookMultiplier = options.includeDoubleHook ? buffs.doubleHook.catchMultiplier : 1;
  const rodFestival = options.includeFestival ? rod.festivalBoost ?? 1 : 1;

  const catchMultiplier =
    rod.catchMultiplier *
    armor.catchMultiplier *
    pet.catchMultiplier *
    skillMultiplier *
    festivalMultiplier *
    doubleHookMultiplier *
    rodFestival;

  const priceMultiplier =
    rod.priceMultiplier *
    armor.priceMultiplier *
    pet.priceMultiplier *
    (options.includeFestival ? buffs.festival.priceMultiplier : 1);

  const catchesPerHour = location.baseCatchesPerHour * catchMultiplier;

  let breakdown = [];
  let profitPerHour = 0;

  const distEntries = Object.entries(location.fishDistribution);
  let defaultProbability = 0;

  distEntries.forEach(([key, chance]) => {
    if (key === "default") {
      defaultProbability += chance;
    } else {
      const fishPrice = getFishPrice(key);
      const fishName = fishMap.get(key)?.name ?? "Unknown Catch";
      const quantityPerHour = catchesPerHour * chance;
      const value = quantityPerHour * fishPrice * priceMultiplier;
      profitPerHour += value;
      breakdown.push({
        id: key,
        name: fishName,
        chance,
        quantityPerHour,
        price: fishPrice * priceMultiplier,
        profitPerHour: value,
      });
    }
  });

  if (defaultProbability < 0.999) {
    defaultProbability = Math.max(0, 1 - breakdown.reduce((acc, item) => acc + item.chance, 0));
  }

  if (defaultProbability > 0) {
    const quantityPerHour = catchesPerHour * defaultProbability;
    const value = quantityPerHour * defaultFishValue * priceMultiplier;
    profitPerHour += value;
    breakdown.push({
      id: "other",
      name: "Other Loot",
      chance: defaultProbability,
      quantityPerHour,
      price: defaultFishValue * priceMultiplier,
      profitPerHour: value,
    });
  }

  const treasureProcsPerHour = catchesPerHour * location.treasureChance;
  const treasureProfit = treasureProcsPerHour * treasureValue * priceMultiplier;
  profitPerHour += treasureProfit;

  breakdown.push({
    id: "treasure",
    name: "Treasure Loot",
    chance: location.treasureChance,
    quantityPerHour: treasureProcsPerHour,
    price: treasureValue * priceMultiplier,
    profitPerHour: treasureProfit,
  });

  breakdown.sort((a, b) => b.profitPerHour - a.profitPerHour);

  return {
    profitPerHour,
    fishPerHour: catchesPerHour,
    breakdown,
    treasureValue: treasureProfit,
  };
};

const renderBreakdown = (breakdown) => {
  const tbody = document.getElementById("breakdown-body");
  tbody.innerHTML = "";

  breakdown.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.name}</td>
      <td>${(row.chance * 100).toFixed(1)}%</td>
      <td>${row.quantityPerHour.toFixed(1)}</td>
      <td>${formatCoins(row.price)}</td>
      <td>${formatCoins(row.profitPerHour)}</td>
    `;
    tbody.appendChild(tr);
  });
};

const renderResults = () => {
  const location = locationMap.get(state.selectedLocation);
  if (!location) return;
  const result = calculateProfit(
    location,
    {
      rod: state.selectedRod,
      armor: state.selectedArmor,
      pet: state.selectedPet,
    },
    {
      skillLevel: state.skillLevel,
      includeFestival: state.includeFestival,
      includeDoubleHook: state.includeDoubleHook,
    }
  );

  const profitHour = document.getElementById("profit-hour");
  const profitSession = document.getElementById("profit-session");
  const fishHour = document.getElementById("fish-hour");

  profitHour.textContent = formatCoins(result.profitPerHour);
  profitSession.textContent = formatCoins(result.profitPerHour * state.sessionLength);
  fishHour.textContent = `${result.fishPerHour.toFixed(1)}`;

  renderBreakdown(result.breakdown);
};

const renderFishTable = () => {
  const tableBody = document.getElementById("fish-table");
  tableBody.innerHTML = "";

  const query = state.searchQuery.trim().toLowerCase();

  [...fishMap.values()]
    .filter((fish) =>
      !query
        ? true
        : fish.name.toLowerCase().includes(query) ||
          fish.type.toLowerCase().includes(query) ||
          fish.rarity.toLowerCase().includes(query)
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((fish) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fish.name}</td>
        <td>${fish.rarity}</td>
        <td>${fish.type}</td>
        <td>
          <input
            class="input input--compact"
            type="number"
            min="0"
            step="50"
            value="${Math.round(fish.basePrice)}"
            data-fish="${fish.id}"
          />
        </td>
        <td>${fish.notes}</td>
      `;
      tableBody.appendChild(tr);
    });
};

const renderLocationComparison = () => {
  const container = document.getElementById("location-comparison");
  container.innerHTML = "";

  const options = {
    skillLevel: state.skillLevel,
    includeFestival: state.includeFestival,
    includeDoubleHook: state.includeDoubleHook,
  };

  const gear = {
    rod: state.selectedRod,
    armor: state.selectedArmor,
    pet: state.selectedPet,
  };

  const locationsWithProfit = locationData.map((location) => ({
    location,
    result: calculateProfit(location, gear, options),
  }));

  locationsWithProfit
    .sort((a, b) => b.result.profitPerHour - a.result.profitPerHour)
    .forEach(({ location, result }) => {
      const card = document.createElement("article");
      card.className = "location-card";
      card.innerHTML = `
        <h3 class="location-card__title">${location.name}</h3>
        <p class="location-card__profit">${formatCoins(result.profitPerHour)}</p>
        <p class="location-card__meta">${location.description}</p>
        <p class="location-card__meta">Catch rate: ${result.fishPerHour.toFixed(1)} / hr</p>
      `;
      container.appendChild(card);
    });

  return locationsWithProfit;
};

const computeAllGearCombos = (locationId) => {
  const options = {
    skillLevel: state.skillLevel,
    includeFestival: state.includeFestival,
    includeDoubleHook: state.includeDoubleHook,
  };
  const location = locationMap.get(locationId);
  if (!location) return [];

  const combos = [];
  gearData.rods.forEach((rod) => {
    gearData.armor.forEach((armor) => {
      gearData.pets.forEach((pet) => {
        const result = calculateProfit(
          location,
          { rod: rod.id, armor: armor.id, pet: pet.id },
          options
        );
        combos.push({
          rod,
          armor,
          pet,
          result,
        });
      });
    });
  });

  combos.sort((a, b) => b.result.profitPerHour - a.result.profitPerHour);
  return combos;
};

const renderOptimizer = () => {
  const locationId = document.getElementById("optimizer-location").value;
  const cardsContainer = document.getElementById("optimizer-cards");
  cardsContainer.innerHTML = "";

  const combos = computeAllGearCombos(locationId).slice(0, 3);

  combos.forEach((combo, index) => {
    const card = document.createElement("article");
    card.className = "optimizer-card";
    card.innerHTML = `
      <h3 class="optimizer-card__title">Tier ${index + 1}</h3>
      <p class="optimizer-card__value">${formatCoins(combo.result.profitPerHour)}</p>
      <ul>
        <li><strong>Rod:</strong> ${combo.rod.name}</li>
        <li><strong>Armor:</strong> ${combo.armor.name}</li>
        <li><strong>Pet:</strong> ${combo.pet.name}</li>
      </ul>
      <p class="optimizer-card__meta">${combo.rod.notes}</p>
    `;
    cardsContainer.appendChild(card);
  });

  if (!combos.length) {
    cardsContainer.innerHTML = `<p>No gear recommendations available.</p>`;
  }

  return combos;
};

const updateOverview = (locationComparison, optimizerCombos) => {
  const topLocation = locationComparison[0];
  const statLocation = document.getElementById("stat-top-location");
  const statGear = document.getElementById("stat-top-gear");
  const statProfit = document.getElementById("stat-top-profit");

  if (topLocation) {
    statLocation.textContent = topLocation.location.name;
    statProfit.textContent = formatCoins(topLocation.result.profitPerHour);
  }

  let bestCombo = optimizerCombos?.[0];

  if (!bestCombo) {
    // evaluate across all locations if optimizer combos missing
    let maxCombo = null;
    locationData.forEach((location) => {
      const combos = computeAllGearCombos(location.id);
      if (combos.length && (!maxCombo || combos[0].result.profitPerHour > maxCombo.result.profitPerHour)) {
        maxCombo = { ...combos[0], location };
      }
    });
    bestCombo = maxCombo;
  }

  if (bestCombo) {
    const description = `${bestCombo.rod.name} · ${bestCombo.armor.name} · ${bestCombo.pet.name}`;
    statGear.textContent = description;
  }
};

const handlePriceEdit = (event) => {
  const target = event.target;
  if (target.matches("input[data-fish]")) {
    const value = Number(target.value);
    if (!Number.isNaN(value)) {
      setFishPrice(target.dataset.fish, value);
      renderResults();
      const locationComparison = renderLocationComparison();
      const optimizerCombos = renderOptimizer();
      updateOverview(locationComparison, optimizerCombos);
    }
  }
};

const attachEventListeners = () => {
  document.getElementById("location-select").addEventListener("change", (event) => {
    state.selectedLocation = event.target.value;
    document.getElementById("optimizer-location").value = state.selectedLocation;
    const locationComparison = renderLocationComparison();
    renderResults();
    const optimizerCombos = renderOptimizer();
    updateOverview(locationComparison, optimizerCombos);
  });

  document.getElementById("rod-select").addEventListener("change", (event) => {
    state.selectedRod = event.target.value;
    const locationComparison = renderLocationComparison();
    renderResults();
    const optimizerCombos = renderOptimizer();
    updateOverview(locationComparison, optimizerCombos);
  });

  document.getElementById("armor-select").addEventListener("change", (event) => {
    state.selectedArmor = event.target.value;
    const locationComparison = renderLocationComparison();
    renderResults();
    const optimizerCombos = renderOptimizer();
    updateOverview(locationComparison, optimizerCombos);
  });

  document.getElementById("pet-select").addEventListener("change", (event) => {
    state.selectedPet = event.target.value;
    const locationComparison = renderLocationComparison();
    renderResults();
    const optimizerCombos = renderOptimizer();
    updateOverview(locationComparison, optimizerCombos);
  });

  document.getElementById("skill-level").addEventListener("input", (event) => {
    state.skillLevel = Number(event.target.value);
    document.getElementById("skill-value").textContent = state.skillLevel;
    const locationComparison = renderLocationComparison();
    renderResults();
    const optimizerCombos = renderOptimizer();
    updateOverview(locationComparison, optimizerCombos);
  });

  document.getElementById("session-length").addEventListener("input", (event) => {
    state.sessionLength = Math.max(0.5, Number(event.target.value) || 1);
    renderResults();
  });

  document.getElementById("festival-toggle").addEventListener("change", (event) => {
    state.includeFestival = event.target.checked;
    const locationComparison = renderLocationComparison();
    renderResults();
    const optimizerCombos = renderOptimizer();
    updateOverview(locationComparison, optimizerCombos);
  });

  document.getElementById("double-hook-toggle").addEventListener("change", (event) => {
    state.includeDoubleHook = event.target.checked;
    const locationComparison = renderLocationComparison();
    renderResults();
    const optimizerCombos = renderOptimizer();
    updateOverview(locationComparison, optimizerCombos);
  });

  document.getElementById("optimizer-location").addEventListener("change", () => {
    const optimizerCombos = renderOptimizer();
    updateOverview(renderLocationComparison(), optimizerCombos);
  });

  document.getElementById("fish-search").addEventListener("input", (event) => {
    state.searchQuery = event.target.value;
    renderFishTable();
  });

  document.getElementById("fish-table").addEventListener("input", handlePriceEdit);
};

const initialize = () => {
  populateSelects();
  renderFishTable();
  const locationComparison = renderLocationComparison();
  const optimizerCombos = renderOptimizer();
  updateOverview(locationComparison, optimizerCombos);
  renderResults();
};

document.addEventListener("DOMContentLoaded", () => {
  initialize();
  attachEventListeners();
});
