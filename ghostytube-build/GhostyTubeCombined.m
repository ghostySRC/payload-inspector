#import <UIKit/UIKit.h>
#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>
#import <objc/runtime.h>
#import <objc/message.h>
#import <mach-o/dyld.h>
#import <dlfcn.h>
#import <math.h>

#pragma mark - Ghosty Volume

static NSString * const kGhostyTweakID = @"GhostyVolume";
static NSString * const kGhostyMultiplierKey = @"GhostyTubeVolumeMultiplier";

static const void *kGhostyBaseVolumeKey = &kGhostyBaseVolumeKey;
static const void *kGhostyPanelKey = &kGhostyPanelKey;
static const void *kGhostySliderKey = &kGhostySliderKey;
static const void *kGhostyLabelKey = &kGhostyLabelKey;
static const void *kGhostyButtonStyledKey = &kGhostyButtonStyledKey;

static NSMutableArray<Class> *gHookedVolumeClasses;
static NSMutableDictionary<NSString *, NSValue *> *gOriginalSetVolumeIMPs;
static NSMutableDictionary<NSString *, NSValue *> *gOriginalButtonImageIMPs;
static NSMutableDictionary<NSString *, NSValue *> *gOriginalLayoutIMPs;
static __weak id gLastVolumeObject;

static NSString *GhostyClassKey(Class cls) { return NSStringFromClass(cls); }

static CGFloat GhostyMultiplier(void) {
    double value = [[NSUserDefaults standardUserDefaults] doubleForKey:kGhostyMultiplierKey];
    if (value < 1.0 || value > 3.0) value = 1.0;
    return (CGFloat)value;
}

static void GhostySaveMultiplier(CGFloat value) {
    value = MAX(1.0, MIN(3.0, value));
    [[NSUserDefaults standardUserDefaults] setDouble:value forKey:kGhostyMultiplierKey];
}

static Class GhostyMatchedVolumeClass(id object) {
    Class cls = object_getClass(object);
    for (Class candidate in gHookedVolumeClasses) {
        for (Class walk = cls; walk; walk = class_getSuperclass(walk)) {
            if (walk == candidate) return candidate;
        }
    }
    return Nil;
}

static void GhostyApplyBaseVolume(id object, float baseVolume) {
    Class matched = GhostyMatchedVolumeClass(object);
    if (!matched) return;
    IMP original = [gOriginalSetVolumeIMPs[GhostyClassKey(matched)] pointerValue];
    if (!original) return;
    float applied = baseVolume * (float)GhostyMultiplier();
    applied = MAX(0.0f, MIN(4.0f, applied));
    ((void(*)(id, SEL, float))original)(object, @selector(setVolume:), applied);
}

static void GhostySetVolume(id self, SEL _cmd, float volume) {
    objc_setAssociatedObject(self, kGhostyBaseVolumeKey, @(volume), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    gLastVolumeObject = self;
    GhostyApplyBaseVolume(self, volume);
}

static void HookVolumeClass(Class cls) {
    if (!cls || [gHookedVolumeClasses containsObject:cls]) return;
    SEL selector = @selector(setVolume:);
    Method method = class_getInstanceMethod(cls, selector);
    if (!method) return;
    IMP current = method_getImplementation(method);
    const char *types = method_getTypeEncoding(method);
    IMP original = class_addMethod(cls, selector, (IMP)GhostySetVolume, types)
        ? current
        : method_setImplementation(class_getInstanceMethod(cls, selector), (IMP)GhostySetVolume);
    if (original) {
        gOriginalSetVolumeIMPs[GhostyClassKey(cls)] = [NSValue valueWithPointer:original];
        [gHookedVolumeClasses addObject:cls];
    }
}

static void GhostyReapplyCurrentVolume(void) {
    id object = gLastVolumeObject;
    NSNumber *base = object ? objc_getAssociatedObject(object, kGhostyBaseVolumeKey) : nil;
    if (object && base) GhostyApplyBaseVolume(object, base.floatValue);
}

static UIVisualEffect *GhostyPanelEffect(void) {
    Class glassClass = NSClassFromString(@"UIGlassEffect");
    SEL factory = NSSelectorFromString(@"effectWithStyle:");
    if (glassClass && [glassClass respondsToSelector:factory]) {
        id (*sendFactory)(id, SEL, NSInteger) = (void *)objc_msgSend;
        id effect = sendFactory(glassClass, factory, 0);
        SEL interactive = NSSelectorFromString(@"setInteractive:");
        if ([effect respondsToSelector:interactive]) {
            void (*sendInteractive)(id, SEL, BOOL) = (void *)objc_msgSend;
            sendInteractive(effect, interactive, YES);
        }
        return effect;
    }
    return [UIBlurEffect effectWithStyle:UIBlurEffectStyleSystemThinMaterialDark];
}

static UIImage *GhostyVolumeImage(void) {
    UIImageSymbolConfiguration *cfg = [UIImageSymbolConfiguration configurationWithPointSize:18 weight:UIImageSymbolWeightSemibold];
    return [[UIImage systemImageNamed:@"speaker.wave.3.fill"] imageByApplyingSymbolConfiguration:cfg];
}

static UIView *GhostyPanelForHost(UIView *host, BOOL create) {
    UIView *panel = objc_getAssociatedObject(host, kGhostyPanelKey);
    if (panel || !create) return panel;

    UIVisualEffectView *glass = [[UIVisualEffectView alloc] initWithEffect:GhostyPanelEffect()];
    glass.clipsToBounds = YES;
    glass.layer.cornerRadius = 18.0;
    glass.hidden = YES;
    glass.alpha = 0.0;

    UISlider *slider = [UISlider new];
    slider.minimumValue = 1.0f; slider.maximumValue = 3.0f; slider.value = (float)GhostyMultiplier();
    slider.continuous = YES;
    slider.accessibilityLabel = @"Ghosty volume multiplier";

    UILabel *label = [UILabel new];
    label.textColor = UIColor.whiteColor;
    label.font = [UIFont systemFontOfSize:13.0 weight:UIFontWeightSemibold];
    label.textAlignment = NSTextAlignmentCenter;
    label.adjustsFontSizeToFitWidth = YES;

    [glass.contentView addSubview:slider];
    [glass.contentView addSubview:label];
    [host addSubview:glass];

    objc_setAssociatedObject(glass, kGhostySliderKey, slider, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    objc_setAssociatedObject(glass, kGhostyLabelKey, label, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    objc_setAssociatedObject(host, kGhostyPanelKey, glass, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    return glass;
}

static void GhostyUpdatePanelLabel(UIView *panel) {
    UILabel *label = objc_getAssociatedObject(panel, kGhostyLabelKey);
    label.text = [NSString stringWithFormat:@"%.0f%%", GhostyMultiplier() * 100.0];
}

static UIButton *GhostyRegisteredButton(UIView *host) {
    @try {
        id buttons = [host valueForKey:@"overlayButtons"];
        if ([buttons isKindOfClass:NSDictionary.class]) {
            id button = [buttons objectForKey:kGhostyTweakID];
            return [button isKindOfClass:UIButton.class] ? button : nil;
        }
    } @catch (__unused id ex) {}
    return nil;
}

static void GhostyStyleRegisteredButton(UIButton *button) {
    if (!button || [objc_getAssociatedObject(button, kGhostyButtonStyledKey) boolValue]) return;
    Class configClass = NSClassFromString(@"UIButtonConfiguration");
    SEL glassSelector = NSSelectorFromString(@"clearGlassButtonConfiguration");
    if (configClass && [configClass respondsToSelector:glassSelector]) {
        id (*send0)(id, SEL) = (void *)objc_msgSend;
        UIButtonConfiguration *configuration = send0(configClass, glassSelector);
        configuration.image = GhostyVolumeImage();
        configuration.baseForegroundColor = UIColor.whiteColor;
        button.configuration = configuration;
    } else {
        [button setImage:GhostyVolumeImage() forState:UIControlStateNormal];
        button.tintColor = UIColor.whiteColor;
    }
    button.accessibilityLabel = @"Ghosty volume";
    objc_setAssociatedObject(button, kGhostyButtonStyledKey, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
}

static void GhostyLayoutPanel(UIView *host) {
    UIButton *button = GhostyRegisteredButton(host);
    if (button) GhostyStyleRegisteredButton(button);
    UIView *panel = GhostyPanelForHost(host, NO);
    if (!panel || panel.hidden) return;

    CGFloat width = MIN(246.0, MAX(190.0, host.bounds.size.width - 24.0));
    CGFloat height = 58.0;
    CGRect buttonRect = button ? [button.superview convertRect:button.frame toView:host] : CGRectMake(host.bounds.size.width - 52.0, host.bounds.size.height - 44.0, 40.0, 40.0);
    CGFloat x = MAX(12.0, MIN(CGRectGetMaxX(buttonRect) - width, host.bounds.size.width - width - 12.0));
    CGFloat y = CGRectGetMinY(buttonRect) - height - 8.0;
    if (y < 8.0) y = CGRectGetMaxY(buttonRect) + 8.0;
    panel.frame = CGRectMake(x, y, width, height);

    UISlider *slider = objc_getAssociatedObject(panel, kGhostySliderKey);
    UILabel *label = objc_getAssociatedObject(panel, kGhostyLabelKey);
    slider.frame = CGRectMake(14.0, 8.0, MAX(104.0, width - 76.0), 42.0);
    label.frame = CGRectMake(width - 60.0, 8.0, 54.0, 42.0);
    [host bringSubviewToFront:panel];
}

@interface GhostyVolumeActions : NSObject
+ (void)sliderChanged:(UISlider *)slider;
@end
@implementation GhostyVolumeActions
+ (void)sliderChanged:(UISlider *)slider {
    CGFloat snapped = round(slider.value * 20.0) / 20.0;
    slider.value = (float)snapped;
    GhostySaveMultiplier(snapped);
    GhostyUpdatePanelLabel(slider.superview.superview);
    GhostyReapplyCurrentVolume();
}
@end

static UIImage *GhostyButtonImage(id self, SEL _cmd, NSString *tweakId) {
    if ([tweakId isEqualToString:kGhostyTweakID]) return GhostyVolumeImage();
    Class cls = object_getClass(self);
    IMP original = [gOriginalButtonImageIMPs[GhostyClassKey(cls)] pointerValue];
    if (!original) for (Class c = class_getSuperclass(cls); c && !original; c = class_getSuperclass(c))
        original = [gOriginalButtonImageIMPs[GhostyClassKey(c)] pointerValue];
    return original ? ((UIImage *(*)(id, SEL, NSString *))original)(self, _cmd, tweakId) : nil;
}

static void GhostyDidPressVolume(id self, SEL _cmd, id sender) {
    UIView *host = (UIView *)self;
    UIView *panel = GhostyPanelForHost(host, YES);
    UISlider *slider = objc_getAssociatedObject(panel, kGhostySliderKey);
    [slider addTarget:GhostyVolumeActions.class action:@selector(sliderChanged:) forControlEvents:UIControlEventValueChanged];
    GhostyStyleRegisteredButton([sender isKindOfClass:UIButton.class] ? sender : GhostyRegisteredButton(host));
    slider.value = (float)GhostyMultiplier();
    GhostyUpdatePanelLabel(panel);
    GhostyLayoutPanel(host);
    BOOL opening = panel.hidden;
    if (opening) {
        panel.hidden = NO; panel.alpha = 0.0; panel.transform = CGAffineTransformMakeScale(0.96, 0.96);
        [UIView animateWithDuration:0.20 animations:^{ panel.alpha = 1.0; panel.transform = CGAffineTransformIdentity; }];
    } else {
        [UIView animateWithDuration:0.16 animations:^{ panel.alpha = 0.0; panel.transform = CGAffineTransformMakeScale(0.97, 0.97); } completion:^(__unused BOOL done) { panel.hidden = YES; panel.transform = CGAffineTransformIdentity; }];
    }
}

static void GhostyOverlayLayout(id self, SEL _cmd) {
    Class cls = object_getClass(self);
    IMP original = [gOriginalLayoutIMPs[GhostyClassKey(cls)] pointerValue];
    if (!original) for (Class c = class_getSuperclass(cls); c && !original; c = class_getSuperclass(c))
        original = [gOriginalLayoutIMPs[GhostyClassKey(c)] pointerValue];
    if (original) ((void(*)(id, SEL))original)(self, _cmd);
    GhostyStyleRegisteredButton(GhostyRegisteredButton((UIView *)self));
    GhostyLayoutPanel((UIView *)self);
}

static void HookOverlayClass(Class cls) {
    if (!cls) return;
    NSString *key = GhostyClassKey(cls);
    SEL imageSel = NSSelectorFromString(@"buttonImage:");
    Method imageMethod = class_getInstanceMethod(cls, imageSel);
    if (imageMethod) {
        IMP current = method_getImplementation(imageMethod);
        const char *types = method_getTypeEncoding(imageMethod);
        IMP original = class_addMethod(cls, imageSel, (IMP)GhostyButtonImage, types) ? current : method_setImplementation(class_getInstanceMethod(cls, imageSel), (IMP)GhostyButtonImage);
        if (original) gOriginalButtonImageIMPs[key] = [NSValue valueWithPointer:original];
    }
    class_addMethod(cls, NSSelectorFromString(@"didPressGhostyVolume:"), (IMP)GhostyDidPressVolume, "v@:@");

    Method layoutMethod = class_getInstanceMethod(cls, @selector(layoutSubviews));
    if (layoutMethod) {
        IMP current = method_getImplementation(layoutMethod);
        const char *types = method_getTypeEncoding(layoutMethod);
        IMP original = class_addMethod(cls, @selector(layoutSubviews), (IMP)GhostyOverlayLayout, types) ? current : method_setImplementation(class_getInstanceMethod(cls, @selector(layoutSubviews)), (IMP)GhostyOverlayLayout);
        if (original) gOriginalLayoutIMPs[key] = [NSValue valueWithPointer:original];
    }
}

static void RegisterWithYTVideoOverlay(void) {
    NSString *overlayPath = [[NSBundle mainBundle].bundlePath stringByAppendingPathComponent:@"Frameworks/YTVideoOverlay.dylib"];
    dlopen(overlayPath.UTF8String, RTLD_LAZY | RTLD_GLOBAL);
    Class manager = NSClassFromString(@"YTSettingsSectionItemManager");
    SEL registerSel = NSSelectorFromString(@"registerTweak:metadata:");
    if (manager && [manager respondsToSelector:registerSel]) {
        NSDictionary *metadata = @{@"accessibilityLabel": @"Ghosty volume", @"selector": @"didPressGhostyVolume:"};
        void (*sendRegister)(id, SEL, NSString *, NSDictionary *) = (void *)objc_msgSend;
        sendRegister(manager, registerSel, kGhostyTweakID, metadata);
    }
}

#pragma mark - Native YouTube Sleep Timer Fix

static BOOL GhostyReturnYES(id self, SEL _cmd) { return YES; }
static BOOL GhostyReturnNO(id self, SEL _cmd) { return NO; }

static const char *kSleepYES[] = {
    "enableSleepTimerClient",
    "enableSleepTimerOffline",
    "enableSleepTimerDurationLeftInOption",
    "enableSleepTimerDurationLeftInOptionServer",
    "hasEnableSleepTimerDurationLeftInOptionServer",
    "postCairoSleeptimerFixes",
    "xplatSleepTimerAsyncEagerInit",
    "hasXplatSleepTimerAsyncEagerInit",
    "sleepTimerFixHomeFrozenFrame",
    "shouldShowSleepTimerActiveStatus",
    "shouldMoveSleeptimerSubscriptions"
};
static const char *kSleepNO[] = {
    "hideSlimStatusForSleeptimer"
};

static BOOL GhostySelectorInList(SEL sel, const char **list, size_t count) {
    const char *name = sel_getName(sel);
    for (size_t i = 0; i < count; i++) if (strcmp(name, list[i]) == 0) return YES;
    return NO;
}

static void GhostyPatchMethodList(Class target) {
    if (!target) return;
    unsigned int count = 0;
    Method *methods = class_copyMethodList(target, &count);
    for (unsigned int i = 0; i < count; i++) {
        Method method = methods[i];
        SEL sel = method_getName(method);
        if (method_getNumberOfArguments(method) != 2) continue;

        char returnType[16] = {0};
        method_getReturnType(method, returnType, sizeof(returnType));
        BOOL isBoolLike = returnType[0] == 'B' || returnType[0] == 'c' || returnType[0] == 'C';
        if (!isBoolLike) continue;

        if (GhostySelectorInList(sel, kSleepYES, sizeof(kSleepYES)/sizeof(kSleepYES[0]))) {
            method_setImplementation(method, (IMP)GhostyReturnYES);
        } else if (GhostySelectorInList(sel, kSleepNO, sizeof(kSleepNO)/sizeof(kSleepNO[0]))) {
            method_setImplementation(method, (IMP)GhostyReturnNO);
        }
    }
    free(methods);
}

static void GhostyPatchSleepTimerFlags(void) {
    int count = objc_getClassList(NULL, 0);
    if (count <= 0) return;
    Class *classes = (__unsafe_unretained Class *)malloc(sizeof(Class) * (size_t)count);
    count = objc_getClassList(classes, count);
    for (int i = 0; i < count; i++) {
        GhostyPatchMethodList(classes[i]);
        GhostyPatchMethodList(object_getClass(classes[i]));
    }
    free(classes);

    // Kill the old YTLite custom sleep-timer entry so the only timer exposed is YouTube's native one.
    // The native timer lives in the player's Settings (gear) menu and uses YTWatchSleepTimerController.
    [[NSUserDefaults standardUserDefaults] setBool:NO forKey:@"SleepTimer"];
    [[NSUserDefaults standardUserDefaults] setBool:NO forKey:@"sleepTimer"];
    [[NSUserDefaults standardUserDefaults] setBool:NO forKey:@"YTLSleepTimer"];
}

static void GhostyScheduleSleepPatches(void) {
    dispatch_async(dispatch_get_main_queue(), ^{ GhostyPatchSleepTimerFlags(); });
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{ GhostyPatchSleepTimerFlags(); });
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(4.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{ GhostyPatchSleepTimerFlags(); });
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(10.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{ GhostyPatchSleepTimerFlags(); });
}

__attribute__((constructor))
static void GhostyTubeInit(void) {
    @autoreleasepool {
        gHookedVolumeClasses = [NSMutableArray array];
        gOriginalSetVolumeIMPs = [NSMutableDictionary dictionary];
        gOriginalButtonImageIMPs = [NSMutableDictionary dictionary];
        gOriginalLayoutIMPs = [NSMutableDictionary dictionary];
        [[NSUserDefaults standardUserDefaults] registerDefaults:@{ kGhostyMultiplierKey: @1.0 }];

        HookVolumeClass(NSClassFromString(@"AVPlayer"));
        HookVolumeClass(NSClassFromString(@"AVAudioPlayer"));
        HookVolumeClass(NSClassFromString(@"AVAudioPlayerNode"));
        HookVolumeClass(NSClassFromString(@"AVSampleBufferAudioRenderer"));

        RegisterWithYTVideoOverlay();
        HookOverlayClass(NSClassFromString(@"YTMainAppControlsOverlayView"));
        HookOverlayClass(NSClassFromString(@"YTInlinePlayerBarContainerView"));

        GhostyScheduleSleepPatches();
    }
}
