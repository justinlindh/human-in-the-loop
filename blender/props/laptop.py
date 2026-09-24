'''Open laptop. laptop_screen is a separate UV quad (pal_screen).'''
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

reset()
join(kit.laptop('l_'), 'laptop')
export()
