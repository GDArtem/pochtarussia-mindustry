// Почта России — мод для Mindustry v7
// Юнит объявлен в units/pochta-carrier.json, здесь только логика

const COOLDOWN_SECONDS = 30;
const MAX_ITEMS = 500;

const DELIVER_ITEMS = [
    Items.copper,
    Items.lead,
    Items.graphite,
    Items.coal,
    Items.titanium,
    Items.thorium,
    Items.silicon,
    Items.plastanium,
    Items.phaseFabric,
    Items.surgeAlloy
];

let activeDeliveries = [];
let selectedItem = null;
let selectedAmount = 100;
let buttonCooldown = 0;

function getPlayerCore() {
    if (!Vars.player || !Vars.player.team()) return null;
    return Vars.player.team().core();
}

function getAlliedCores() {
    const cores = [];
    for (let team of Team.all) {
        if (team === Vars.player.team()) continue;
        if (team === Team.derelict) continue;
        const core = team.core();
        if (core && core.isValid()) cores.push(core);
    }
    return cores;
}

function getItemName(item) {
    return item.localizedName || item.name;
}

function spawnDelivery(targetCore, item, amount) {
    const myCore = getPlayerCore();
    if (!myCore) return;

    myCore.items.remove(item, amount);

    const pochtaType = Vars.content.unit("pochta-rossii-pochta-carrier");
    const unit = pochtaType.create(Vars.player.team());
    unit.set(myCore.x, myCore.y);
    unit.add();

    activeDeliveries.push({
        unit: unit,
        targetCore: targetCore,
        item: item,
        amount: amount,
        delivered: false
    });

    Vars.ui.announce(
        "[cyan]Почта России[] отправила посылку!\n" +
        "[yellow]" + amount + "x " + getItemName(item) + "[] летит к союзнику!",
        4
    );
}

function updateDeliveries() {
    activeDeliveries = activeDeliveries.filter(d => {
        if (!d.unit || !d.unit.isValid() || !d.unit.isAlive()) return false;
        if (d.delivered) return false;

        const tc = d.targetCore;
        if (!tc || !tc.isValid()) {
            d.unit.kill();
            return false;
        }

        const dx = tc.x - d.unit.x;
        const dy = tc.y - d.unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 30) {
            tc.items.add(d.item, Math.min(d.amount, tc.storageCapacity - tc.items.get(d.item)));
            d.unit.kill();
            d.delivered = true;
            Vars.ui.announce(
                "[green]Почта России[] доставила посылку!\n" +
                "[yellow]" + d.amount + "x " + getItemName(d.item) + "[] получено!",
                4
            );
            return false;
        }

        d.unit.vel.set(
            (dx / dist) * 1.5,
            (dy / dist) * 1.5
        );
        d.unit.rotation = Mathf.angle(dx, dy);
        d.unit.shield = 99999;

        return true;
    });
}

function showDeliveryDialog() {
    const allied = getAlliedCores();
    if (allied.length === 0) {
        Vars.ui.showInfo("[red]Нет союзных ядер для доставки!");
        return;
    }
    const myCore = getPlayerCore();
    if (!myCore) {
        Vars.ui.showInfo("[red]У тебя нет ядра!");
        return;
    }

    const dialog = new BaseDialog("Почта России");
    dialog.cont.defaults().pad(6);
    dialog.cont.add("[cyan]Выбери ресурс и количество:").row();

    const itemTable = dialog.cont.table().get();
    itemTable.defaults().pad(3);

    let selectedBtn = null;
    selectedItem = null;

    DELIVER_ITEMS.forEach(item => {
        const available = myCore.items.get(item);
        if (available <= 0) return;

        const btn = itemTable.button(
            new TextureRegionDrawable(item.uiIcon),
            Styles.clearTogglei,
            () => {
                selectedItem = item;
                if (selectedBtn) selectedBtn.setChecked(false);
                selectedBtn = btn;
                btn.setChecked(true);
            }
        ).size(48, 48).get();
    });

    dialog.cont.row();
    dialog.cont.add("Количество:").left().row();
    const amountLabel = dialog.cont.label(() => "[yellow]" + selectedAmount).get();

    const slider = new Slider(1, MAX_ITEMS, 1, false);
    slider.setValue(selectedAmount);
    slider.changed(() => { selectedAmount = Math.floor(slider.getValue()); });
    dialog.cont.add(slider).width(260).row();

    dialog.cont.table(t => {
        [50, 100, 200, 500].forEach(n => {
            t.button("" + n, () => { slider.setValue(n); selectedAmount = n; }).width(60).pad(4);
        });
    }).row();

    dialog.cont.button("[cyan]Отправить посылку!", () => {
        if (!selectedItem) {
            Vars.ui.showInfo("[red]Выбери ресурс!");
            return;
        }
        if (myCore.items.get(selectedItem) < selectedAmount) {
            Vars.ui.showInfo("[red]Недостаточно " + getItemName(selectedItem) + "!");
            return;
        }
        spawnDelivery(allied[0], selectedItem, selectedAmount);
        buttonCooldown = COOLDOWN_SECONDS * 60;
        dialog.hide();
    }).width(240).height(50).pad(6).row();

    dialog.addCloseButton();
    dialog.show();
}

Events.on(EventType.ClientLoadEvent, () => {
    // явно указываем тип Cons чтобы Rhino не путал перегрузки fill()
    Vars.ui.hudGroup.fill(new Cons(cont => {
        cont.bottom().left();
        cont.table(Styles.black3, new Cons(t => {
            const btn = t.button("[cyan]Запросить поставку", new Runnable(() => {
                if (buttonCooldown > 0) {
                    Vars.ui.showInfo("[red]Кулдаун: " + Math.ceil(buttonCooldown / 60) + " сек.");
                    return;
                }
                showDeliveryDialog();
            })).size(220, 40).pad(8).get();

            btn.update(new Runnable(() => {
                if (buttonCooldown > 0) {
                    buttonCooldown--;
                    btn.setText("[gray]" + Math.ceil(buttonCooldown / 60) + " сек.");
                } else {
                    btn.setText("[cyan]Запросить поставку");
                }
            }));
        })).pad(8);
    }));
});

Events.on(EventType.Trigger.update, () => {
    if (!Vars.state.isGame()) return;
    updateDeliveries();
});
