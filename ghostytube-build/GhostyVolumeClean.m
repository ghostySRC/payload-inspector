#import <UIKit/UIKit.h>
#import <AVFoundation/AVFoundation.h>
#import <objc/runtime.h>
#import <objc/message.h>

static NSString * const kGhostyMultiplierKey = @"GhostyTubeVolumeMultiplier";
static const void *kGhostyBaseVolumeKey = &kGhostyBaseVolumeKey;
static const void *kGhostyButtonKey = &kGhostyButtonKey;
static const void *kGhostyPanelKey = &kGhostyPanelKey;
static const void *kGhostySliderKey = &kGhostySliderKey;
static const void *kGhostyLabelKey = &kGhostyLabelKey;

static CGFloat GhostyMultiplier(void) {
    double v = [[NSUserDefaults standardUserDefaults] doubleForKey:kGhostyMultiplierKey];
    if (v < 1.0 || v > 3.0) v = 1.0;
    return (CGFloat)v;
}

static void GhostySetMultiplier(CGFloat value) {
    value = MAX(1.0, MIN(3.0, value));
    [[NSUserDefaults standardUserDefaults] setDouble:value forKey:kGhostyMultiplierKey];
    [[NSNotificationCenter defaultCenter] postNotificationName:@"GhostyTubeMultiplierChanged" object:nil];
}

static NSMutableArray<Class> *gHookedVolumeClasses;
static NSMutableDictionary<NSString *, NSValue *> *gOriginalSetVolumeIMPs;

static NSString *GhostyClassKey(Class cls) {
    return NSStringFromClass(cls);
}

static void GhostySetVolume(id self, SEL _cmd, float volume) {
    Class cls = object_getClass(self);
    Class matched = Nil;
    for (Class c in gHookedVolumeClasses) {
        Class walk = cls;
        while (walk) {
            if (walk == c) { matched = c; break; }
            walk = class_getSuperclass(walk);
        }
        if (matched) break;
    }
    if (!matched) return;

    objc_setAssociatedObject(self, kGhostyBaseVolumeKey, @(volume), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    IMP imp = [gOriginalSetVolumeIMPs[GhostyClassKey(matched)] pointerValue];
    if (!imp) return;

    float applied = volume * (float)GhostyMultiplier();
    applied = MAX(0.0f, MIN(4.0f, applied));
    ((void(*)(id,SEL,float))imp)(self, _cmd, applied);
}

static void HookVolumeClass(Class cls) {
    if (!cls) return;
    SEL sel = @selector(setVolume:);
    Method m = class_getInstanceMethod(cls, sel);
    if (!m) return;

    IMP original = method_getImplementation(m);
    const char *types = method_getTypeEncoding(m);
    if (class_addMethod(cls, sel, (IMP)GhostySetVolume, types)) {
        gOriginalSetVolumeIMPs[GhostyClassKey(cls)] = [NSValue valueWithPointer:original];
    } else {
        Method own = class_getInstanceMethod(cls, sel);
        IMP old = method_setImplementation(own, (IMP)GhostySetVolume);
        gOriginalSetVolumeIMPs[GhostyClassKey(cls)] = [NSValue valueWithPointer:old];
    }
    [gHookedVolumeClasses addObject:cls];
}

@interface GhostyVolumeTarget : NSObject
@property (nonatomic, weak) UIView *overlay;
@end

@implementation GhostyVolumeTarget

- (UIVisualEffect *)glassEffect {
    Class glass = NSClassFromString(@"UIGlassEffect");
    SEL effectSel = NSSelectorFromString(@"effectWithStyle:");
    if (glass && [glass respondsToSelector:effectSel]) {
        id (*send)(id, SEL, NSInteger) = (void *)objc_msgSend;
        return send(glass, effectSel, 0); // UIGlassEffectStyleRegular
    }
    return [UIBlurEffect effectWithStyle:UIBlurEffectStyleSystemThinMaterialDark];
}

- (UIButton *)makeButton {
    UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem];
    button.accessibilityLabel = @"Ghosty volume";
    button.tintColor = UIColor.whiteColor;

    UIImage *image = [UIImage systemImageNamed:@"speaker.wave.3.fill"];
    Class configClass = NSClassFromString(@"UIButtonConfiguration");
    SEL glassSel = NSSelectorFromString(@"clearGlassButtonConfiguration");
    if (configClass && [configClass respondsToSelector:glassSel]) {
        id (*send0)(id, SEL) = (void *)objc_msgSend;
        UIButtonConfiguration *config = send0(configClass, glassSel);
        config.image = image;
        button.configuration = config; // genuine iOS 26 Liquid Glass
    } else {
        [button setImage:image forState:UIControlStateNormal];
    }

    [button addTarget:self action:@selector(togglePanel:) forControlEvents:UIControlEventTouchUpInside];

    UILongPressGestureRecognizer *longPress = [[UILongPressGestureRecognizer alloc] initWithTarget:self action:@selector(resetVolume:)];
    longPress.minimumPressDuration = 0.45;
    [button addGestureRecognizer:longPress];
    return button;
}

- (UIView *)makePanel {
    UIVisualEffectView *panel = [[UIVisualEffectView alloc] initWithEffect:[self glassEffect]];
    panel.clipsToBounds = YES;
    panel.layer.cornerRadius = 18.0;
    panel.hidden = YES;

    UISlider *slider = [[UISlider alloc] init];
    slider.minimumValue = 1.0f;
    slider.maximumValue = 3.0f;
    slider.value = (float)GhostyMultiplier();
    slider.continuous = YES;
    slider.accessibilityLabel = @"Ghosty volume multiplier";
    [slider addTarget:self action:@selector(sliderChanged:) forControlEvents:UIControlEventValueChanged];

    UILabel *label = [[UILabel alloc] init];
    label.textColor = UIColor.whiteColor;
    label.font = [UIFont systemFontOfSize:13 weight:UIFontWeightSemibold];
    label.textAlignment = NSTextAlignmentCenter;
    label.adjustsFontSizeToFitWidth = YES;

    [panel.contentView addSubview:slider];
    [panel.contentView addSubview:label];
    objc_setAssociatedObject(panel, kGhostySliderKey, slider, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    objc_setAssociatedObject(panel, kGhostyLabelKey, label, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    [self updateLabel:panel];
    return panel;
}

- (void)updateLabel:(UIView *)panel {
    UILabel *label = objc_getAssociatedObject(panel, kGhostyLabelKey);
    label.text = [NSString stringWithFormat:@"%.0f%%", GhostyMultiplier() * 100.0];
}

- (void)togglePanel:(UIButton *)sender {
    UIView *panel = objc_getAssociatedObject(self.overlay, kGhostyPanelKey);
    if (!panel) return;
    panel.hidden = !panel.hidden;
    UISlider *slider = objc_getAssociatedObject(panel, kGhostySliderKey);
    slider.value = (float)GhostyMultiplier();
    [self updateLabel:panel];
}

- (void)sliderChanged:(UISlider *)slider {
    CGFloat snapped = round(slider.value * 20.0) / 20.0;
    GhostySetMultiplier(snapped);
    UIView *panel = objc_getAssociatedObject(self.overlay, kGhostyPanelKey);
    [self updateLabel:panel];

    for (Class c in gHookedVolumeClasses) {
        // Re-applying is handled naturally on YouTube's next volume setter call.
        // This avoids retaining player instances or disturbing playback ownership.
        (void)c;
    }
}

- (void)resetVolume:(UILongPressGestureRecognizer *)gesture {
    if (gesture.state != UIGestureRecognizerStateBegan) return;
    GhostySetMultiplier(1.0);
    UIView *panel = objc_getAssociatedObject(self.overlay, kGhostyPanelKey);
    UISlider *slider = objc_getAssociatedObject(panel, kGhostySliderKey);
    slider.value = 1.0f;
    [self updateLabel:panel];
    UIImpactFeedbackGenerator *feedback = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleLight];
    [feedback impactOccurred];
}
@end

static IMP gOriginalLayout = NULL;
static GhostyVolumeTarget *gTarget = nil;

static void GhostyLayoutSubviews(id self, SEL _cmd) {
    if (gOriginalLayout) ((void(*)(id,SEL))gOriginalLayout)(self, _cmd);

    UIView *overlay = (UIView *)self;
    if (overlay.bounds.size.width < 120.0 || overlay.bounds.size.height < 80.0) return;

    UIButton *button = objc_getAssociatedObject(overlay, kGhostyButtonKey);
    UIView *panel = objc_getAssociatedObject(overlay, kGhostyPanelKey);

    if (!button) {
        gTarget.overlay = overlay;
        button = [gTarget makeButton];
        [overlay addSubview:button];
        objc_setAssociatedObject(overlay, kGhostyButtonKey, button, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    if (!panel) {
        gTarget.overlay = overlay;
        panel = [gTarget makePanel];
        [overlay addSubview:panel];
        objc_setAssociatedObject(overlay, kGhostyPanelKey, panel, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }

    CGFloat w = overlay.bounds.size.width;
    CGFloat h = overlay.bounds.size.height;

    // Native-feeling position: immediately left of YouTube's right-most player control.
    button.frame = CGRectMake(w - 94.0, h - 50.0, 40.0, 40.0);

    CGFloat pw = MIN(238.0, w - 24.0);
    CGFloat px = MAX(12.0, w - pw - 12.0);
    CGFloat py = MAX(8.0, h - 116.0);
    panel.frame = CGRectMake(px, py, pw, 58.0);

    UISlider *slider = objc_getAssociatedObject(panel, kGhostySliderKey);
    UILabel *label = objc_getAssociatedObject(panel, kGhostyLabelKey);
    slider.frame = CGRectMake(14.0, 8.0, MAX(100.0, pw - 72.0), 42.0);
    label.frame = CGRectMake(pw - 58.0, 8.0, 52.0, 42.0);

    [overlay bringSubviewToFront:button];
    [overlay bringSubviewToFront:panel];
    [overlay bringSubviewToFront:button];
}

static void HookOverlayClass(Class cls) {
    if (!cls) return;
    SEL sel = @selector(layoutSubviews);
    Method m = class_getInstanceMethod(cls, sel);
    if (!m) return;
    const char *types = method_getTypeEncoding(m);
    IMP inherited = method_getImplementation(m);
    if (class_addMethod(cls, sel, (IMP)GhostyLayoutSubviews, types)) {
        gOriginalLayout = inherited;
    } else {
        Method own = class_getInstanceMethod(cls, sel);
        gOriginalLayout = method_setImplementation(own, (IMP)GhostyLayoutSubviews);
    }
}

__attribute__((constructor))
static void GhostyTubeInit(void) {
    @autoreleasepool {
        gHookedVolumeClasses = [NSMutableArray array];
        gOriginalSetVolumeIMPs = [NSMutableDictionary dictionary];
        gTarget = [GhostyVolumeTarget new];

        HookVolumeClass(NSClassFromString(@"AVPlayer"));
        HookVolumeClass(NSClassFromString(@"AVAudioPlayer"));
        HookVolumeClass(NSClassFromString(@"AVAudioPlayerNode"));
        HookVolumeClass(NSClassFromString(@"AVSampleBufferAudioRenderer"));

        Class overlay = NSClassFromString(@"YTMainAppControlsOverlayView");
        if (!overlay) overlay = NSClassFromString(@"YTMainAppVideoPlayerOverlayView");
        HookOverlayClass(overlay);
    }
}
