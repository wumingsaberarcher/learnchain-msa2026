namespace backend.Services;

/// <summary>Short cold facts for daily Canal chitchat (rotate, avoid immediate repeats).</summary>
public static class ColdFacts
{
    private static readonly string[] Zh =
    [
        "抹香鲸的脑子大约有人类的五倍重。",
        "地球上约 71% 的表面被海洋覆盖。",
        "章鱼有三颗心脏，两颗专门给鳃供血。",
        "蜂鸟是唯一能向后飞的鸟类。",
        "撒哈拉沙漠里其实有季节性降雪的记录。",
        "一条蓝鲸的舌头可以和一头大象差不多重。",
        "闪电的温度可比太阳表面还烫。",
        "南极洲是世界上最干燥的大陆之一。",
        "海豚睡觉时大脑会轮流休息半边。",
        "竹子是生长最快的植物之一，有的一天能窜高一米。",
        "火星天空在白天偏淡黄油色，日落时会偏蓝。",
        "珊瑚其实是动物，不是植物。",
        "北极熊的皮肤是黑色的，毛发近似透明。",
        "亚马孙河的流量比世界上任何一条河都大。",
        "海獭睡觉时会手拉手，以免漂散开。",
        "长颈鹿每天只需要睡大约半小时左右。",
        "月球在慢慢远离地球，每年大约远几厘米。",
        "鲨鱼比树木更古老——它们比恐龙还早出现。",
        "世界上最大的沙漠其实是南极（冻沙漠）。",
        "萤火虫发光几乎不发热，效率高得惊人。",
        "海马是由雄性怀孕育儿的。",
        "金星自转方向和大多数行星相反。",
        "北极光其实是带电粒子撞到大气层发的光。",
        "土星密度比水还低，理论上能“浮”在巨大浴缸里。",
        "海星没有大脑，但有一套散布全身的神经网。",
        "考拉的指纹和人类的很像，曾难倒过鉴定。",
        "变色龙的舌头常常比身体还长。",
        "太平洋之广，能装下地球上所有陆地还有余。",
        "红树林能在盐水里扎根，像海岸的绿篱笆。",
        "珠穆朗玛峰每年还在缓慢长高一点点。",
    ];

    private static readonly string[] En =
    [
        "A sperm whale’s brain can weigh about five times a human’s.",
        "Oceans cover roughly 71% of Earth’s surface.",
        "Octopuses have three hearts — two pump blood to the gills.",
        "Hummingbirds are the only birds that can fly backward.",
        "It has snowed in the Sahara on rare occasions.",
        "A blue whale’s tongue can weigh about as much as an elephant.",
        "A lightning bolt can be hotter than the surface of the Sun.",
        "Antarctica is one of the driest places on Earth.",
        "Dolphins rest one half of their brain at a time.",
        "Some bamboo can grow nearly a meter in a single day.",
        "Martian skies look buttery by day and bluish at sunset.",
        "Coral is an animal, not a plant.",
        "Polar bears have black skin under nearly clear fur.",
        "The Amazon moves more water than any other river.",
        "Sea otters sometimes hold paws while sleeping so they don’t drift apart.",
        "Giraffes often sleep only about half an hour a day.",
        "The Moon drifts a few centimeters farther from Earth each year.",
        "Sharks are older than trees — and older than dinosaurs.",
        "Antarctica is technically the world’s largest desert (a cold one).",
        "Firefly light is almost heatless — wildly efficient.",
        "Male seahorses are the ones that carry the pregnancy.",
        "Venus spins the opposite way from most planets.",
        "Auroras are charged particles lighting up the upper air.",
        "Saturn is less dense than water — in theory it could float.",
        "Starfish have no brain — just a body-wide nerve net.",
        "Koala fingerprints can look startlingly human.",
        "A chameleon’s tongue is often longer than its body.",
        "The Pacific could hold all of Earth’s land and still have room.",
        "Mangroves root in salt water like living coastal fences.",
        "Everest still creeps upward a tiny bit each year.",
    ];

    public static string Pick(bool zh, int userId)
    {
        var pool = zh ? Zh : En;
        // Rotate by user + UTC day slot so consecutive chats differ without server-side state.
        var slot = (int)(DateTime.UtcNow.Ticks / TimeSpan.TicksPerMinute / 7);
        var idx = Math.Abs(HashCode.Combine(userId, slot, DateTime.UtcNow.Second / 20)) % pool.Length;
        return pool[idx];
    }
}
